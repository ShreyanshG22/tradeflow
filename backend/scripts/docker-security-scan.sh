#!/bin/bash

# Docker Security Scanning Script for TradeFlow Backend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RESULTS_DIR="$PROJECT_ROOT/security-scan-results"

echo -e "${GREEN}🔒 Docker Security Scanning${NC}"
echo -e "${BLUE}Scanning Docker containers for security vulnerabilities...${NC}"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Function to scan image
scan_image() {
    local image_name=$1
    local service_name=$2
    
    echo -e "\n${YELLOW}Scanning $service_name ($image_name)...${NC}"
    
    # Check if image exists
    if ! docker image inspect "$image_name" &> /dev/null; then
        echo -e "${RED}❌ Image $image_name not found. Building...${NC}"
        docker-compose build "$service_name" || {
            echo -e "${RED}❌ Failed to build $service_name${NC}"
            return 1
        }
    fi
    
    # Scan with Docker Scout (if available)
    if command -v docker &> /dev/null && docker scout version &> /dev/null 2>&1; then
        echo -e "${BLUE}Running Docker Scout scan...${NC}"
        docker scout cves "$image_name" --format json > "$RESULTS_DIR/${service_name}-scout.json" 2>/dev/null || {
            echo -e "${YELLOW}⚠️  Docker Scout not available or failed${NC}"
        }
    fi
    
    # Scan with Trivy (if available)
    if command -v trivy &> /dev/null; then
        echo -e "${BLUE}Running Trivy scan...${NC}"
        trivy image --format json --output "$RESULTS_DIR/${service_name}-trivy.json" "$image_name" || {
            echo -e "${YELLOW}⚠️  Trivy scan failed${NC}"
        }
    else
        echo -e "${YELLOW}⚠️  Trivy not installed. Install with: curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin${NC}"
    fi
    
    # Basic security checks
    echo -e "${BLUE}Running basic security checks...${NC}"
    
    # Check for root user
    if docker run --rm "$image_name" whoami 2>/dev/null | grep -q "root"; then
        echo -e "${RED}❌ Container runs as root user${NC}" | tee -a "$RESULTS_DIR/${service_name}-basic.txt"
    else
        echo -e "${GREEN}✅ Container runs as non-root user${NC}" | tee -a "$RESULTS_DIR/${service_name}-basic.txt"
    fi
    
    # Check for package managers
    if docker run --rm "$image_name" which apt-get &>/dev/null || \
       docker run --rm "$image_name" which yum &>/dev/null || \
       docker run --rm "$image_name" which apk &>/dev/null; then
        echo -e "${YELLOW}⚠️  Package manager found in container${NC}" | tee -a "$RESULTS_DIR/${service_name}-basic.txt"
    else
        echo -e "${GREEN}✅ No package managers found${NC}" | tee -a "$RESULTS_DIR/${service_name}-basic.txt"
    fi
    
    # Check image size
    local size=$(docker image inspect "$image_name" --format='{{.Size}}' | awk '{print int($1/1024/1024)}')
    echo -e "${BLUE}ℹ️  Image size: ${size}MB${NC}" | tee -a "$RESULTS_DIR/${service_name}-basic.txt"
    
    if [ "$size" -gt 1000 ]; then
        echo -e "${YELLOW}⚠️  Large image size (>1GB)${NC}" | tee -a "$RESULTS_DIR/${service_name}-basic.txt"
    fi
}

# Function to check Dockerfile security
check_dockerfile() {
    local dockerfile_path=$1
    local service_name=$2
    
    echo -e "\n${YELLOW}Checking Dockerfile security for $service_name...${NC}"
    
    if [ ! -f "$dockerfile_path" ]; then
        echo -e "${RED}❌ Dockerfile not found: $dockerfile_path${NC}"
        return 1
    fi
    
    local issues=0
    
    # Check for COPY --chown
    if grep -q "COPY.*--chown" "$dockerfile_path"; then
        echo -e "${GREEN}✅ Uses COPY --chown${NC}"
    else
        echo -e "${YELLOW}⚠️  Consider using COPY --chown for better security${NC}"
        ((issues++))
    fi
    
    # Check for USER instruction
    if grep -q "^USER " "$dockerfile_path"; then
        echo -e "${GREEN}✅ Sets non-root user${NC}"
    else
        echo -e "${RED}❌ No USER instruction found${NC}"
        ((issues++))
    fi
    
    # Check for HEALTHCHECK
    if grep -q "^HEALTHCHECK" "$dockerfile_path"; then
        echo -e "${GREEN}✅ Has HEALTHCHECK${NC}"
    else
        echo -e "${YELLOW}⚠️  No HEALTHCHECK instruction${NC}"
        ((issues++))
    fi
    
    # Check for secrets in ENV
    if grep -i "password\|secret\|key" "$dockerfile_path" | grep -q "ENV"; then
        echo -e "${RED}❌ Potential secrets in ENV instructions${NC}"
        ((issues++))
    else
        echo -e "${GREEN}✅ No obvious secrets in ENV${NC}"
    fi
    
    # Check for latest tag
    if grep -q ":latest" "$dockerfile_path"; then
        echo -e "${YELLOW}⚠️  Uses :latest tag${NC}"
        ((issues++))
    else
        echo -e "${GREEN}✅ Uses specific image tags${NC}"
    fi
    
    echo "Security issues found: $issues" > "$RESULTS_DIR/${service_name}-dockerfile.txt"
    
    return $issues
}

# Main scanning process
echo -e "\n${YELLOW}Starting security scans...${NC}"

# Build all images first
echo -e "${BLUE}Building all Docker images...${NC}"
cd "$PROJECT_ROOT"
docker-compose build

# Scan each service
services=(
    "tradeflow-api-gateway:api-gateway"
    "tradeflow-user-service:user-service"
    "tradeflow-strategy-service:strategy-service"
    "tradeflow-portfolio-service:portfolio-service"
    "tradeflow-market-data-service:market-data-service"
    "tradeflow-trading-engine:trading-engine"
)

total_issues=0

for service_info in "${services[@]}"; do
    IFS=':' read -r image_name service_name <<< "$service_info"
    
    # Scan container image
    scan_image "$image_name" "$service_name" || ((total_issues++))
    
    # Check Dockerfile
    dockerfile_path="docker/${service_name}/Dockerfile"
    if [ -f "$dockerfile_path" ]; then
        check_dockerfile "$dockerfile_path" "$service_name" || ((total_issues++))
    fi
done

# Scan base images
echo -e "\n${YELLOW}Scanning base images...${NC}"
base_images=("postgres:15-alpine" "redis:7-alpine" "node:18-alpine")

for base_image in "${base_images[@]}"; do
    echo -e "\n${BLUE}Pulling and scanning $base_image...${NC}"
    docker pull "$base_image" &>/dev/null || echo -e "${YELLOW}⚠️  Failed to pull $base_image${NC}"
    
    if command -v trivy &> /dev/null; then
        trivy image --format json --output "$RESULTS_DIR/base-$(echo $base_image | tr ':/' '-')-trivy.json" "$base_image" 2>/dev/null || {
            echo -e "${YELLOW}⚠️  Trivy scan failed for $base_image${NC}"
        }
    fi
done

# Generate summary report
echo -e "\n${YELLOW}Generating security summary...${NC}"
cat > "$RESULTS_DIR/security-summary.md" << EOF
# Docker Security Scan Summary

Generated: $(date)

## Scanned Services
$(for service_info in "${services[@]}"; do
    IFS=':' read -r image_name service_name <<< "$service_info"
    echo "- $service_name ($image_name)"
done)

## Base Images Scanned
$(for base_image in "${base_images[@]}"; do
    echo "- $base_image"
done)

## Results Location
- Detailed results: $RESULTS_DIR/
- Trivy reports: *-trivy.json
- Docker Scout reports: *-scout.json
- Basic security checks: *-basic.txt
- Dockerfile analysis: *-dockerfile.txt

## Recommendations
1. Install Trivy for comprehensive vulnerability scanning
2. Install Docker Scout for additional security insights
3. Review all YELLOW warnings in the scan output
4. Address any RED security issues immediately
5. Regularly update base images and dependencies

## Next Steps
1. Review individual service reports
2. Update vulnerable dependencies
3. Implement security fixes
4. Re-run scans to verify fixes
EOF

echo -e "\n${GREEN}🔒 Security scan completed!${NC}"
echo -e "${BLUE}Results saved to: $RESULTS_DIR/${NC}"
echo -e "${BLUE}Summary report: $RESULTS_DIR/security-summary.md${NC}"

if [ $total_issues -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Found $total_issues security issues. Please review the reports.${NC}"
    exit 1
else
    echo -e "${GREEN}✅ No critical security issues found${NC}"
fi