#!/bin/bash

# TradeFlow Log Management Script
# Handles log retention, archival, and cleanup policies

set -e

# Configuration
ELASTICSEARCH_HOST="${ELASTICSEARCH_HOST:-http://localhost:9200}"
LOG_RETENTION_DAYS="${LOG_RETENTION_DAYS:-30}"
ARCHIVE_RETENTION_DAYS="${ARCHIVE_RETENTION_DAYS:-365}"
ARCHIVE_PATH="${ARCHIVE_PATH:-/var/log/tradeflow/archive}"
BACKUP_PATH="${BACKUP_PATH:-/var/backups/tradeflow-logs}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Check if Elasticsearch is available
check_elasticsearch() {
    log "Checking Elasticsearch connectivity..."
    if curl -s "$ELASTICSEARCH_HOST/_cluster/health" > /dev/null; then
        log "Elasticsearch is available"
        return 0
    else
        error "Elasticsearch is not available at $ELASTICSEARCH_HOST"
        return 1
    fi
}

# Create index lifecycle management policy
create_ilm_policy() {
    log "Creating Index Lifecycle Management policy..."
    
    curl -X PUT "$ELASTICSEARCH_HOST/_ilm/policy/tradeflow-logs-policy" \
        -H "Content-Type: application/json" \
        -d '{
            "policy": {
                "phases": {
                    "hot": {
                        "actions": {
                            "rollover": {
                                "max_size": "5GB",
                                "max_age": "1d"
                            },
                            "set_priority": {
                                "priority": 100
                            }
                        }
                    },
                    "warm": {
                        "min_age": "7d",
                        "actions": {
                            "allocate": {
                                "number_of_replicas": 0
                            },
                            "forcemerge": {
                                "max_num_segments": 1
                            },
                            "set_priority": {
                                "priority": 50
                            }
                        }
                    },
                    "cold": {
                        "min_age": "30d",
                        "actions": {
                            "allocate": {
                                "number_of_replicas": 0
                            },
                            "set_priority": {
                                "priority": 0
                            }
                        }
                    },
                    "delete": {
                        "min_age": "'$LOG_RETENTION_DAYS'd"
                    }
                }
            }
        }'
    
    log "ILM policy created successfully"
}

# Create index templates with ILM policy
create_index_templates() {
    log "Creating index templates..."
    
    # Main logs template
    curl -X PUT "$ELASTICSEARCH_HOST/_index_template/tradeflow-logs" \
        -H "Content-Type: application/json" \
        -d '{
            "index_patterns": ["tradeflow-*"],
            "template": {
                "settings": {
                    "number_of_shards": 1,
                    "number_of_replicas": 1,
                    "index.lifecycle.name": "tradeflow-logs-policy",
                    "index.lifecycle.rollover_alias": "tradeflow-logs",
                    "index.refresh_interval": "5s",
                    "index.codec": "best_compression"
                },
                "mappings": {
                    "properties": {
                        "@timestamp": {
                            "type": "date"
                        },
                        "level": {
                            "type": "keyword"
                        },
                        "message": {
                            "type": "text",
                            "analyzer": "standard"
                        },
                        "service": {
                            "type": "keyword"
                        },
                        "environment": {
                            "type": "keyword"
                        },
                        "requestId": {
                            "type": "keyword"
                        },
                        "userId": {
                            "type": "keyword"
                        },
                        "duration": {
                            "type": "long"
                        },
                        "statusCode": {
                            "type": "integer"
                        },
                        "error": {
                            "properties": {
                                "name": {
                                    "type": "keyword"
                                },
                                "message": {
                                    "type": "text"
                                },
                                "stack": {
                                    "type": "text",
                                    "index": false
                                }
                            }
                        }
                    }
                }
            }
        }'
    
    log "Index templates created successfully"
}

# Archive old indices
archive_old_indices() {
    log "Archiving old indices..."
    
    # Create archive directory
    mkdir -p "$ARCHIVE_PATH"
    
    # Get indices older than retention period
    CUTOFF_DATE=$(date -d "$LOG_RETENTION_DAYS days ago" +%Y.%m.%d)
    
    # List indices to archive
    INDICES_TO_ARCHIVE=$(curl -s "$ELASTICSEARCH_HOST/_cat/indices/tradeflow-*?h=index" | \
        grep -E "tradeflow-.*-[0-9]{4}\.[0-9]{2}\.[0-9]{2}" | \
        while read index; do
            INDEX_DATE=$(echo "$index" | grep -oE "[0-9]{4}\.[0-9]{2}\.[0-9]{2}")
            if [[ "$INDEX_DATE" < "$CUTOFF_DATE" ]]; then
                echo "$index"
            fi
        done)
    
    for index in $INDICES_TO_ARCHIVE; do
        log "Archiving index: $index"
        
        # Create snapshot
        SNAPSHOT_NAME="snapshot-$index-$(date +%Y%m%d-%H%M%S)"
        
        # Export index data
        curl -X GET "$ELASTICSEARCH_HOST/$index/_search?scroll=5m&size=1000" \
            -H "Content-Type: application/json" \
            -d '{"query": {"match_all": {}}}' | \
            gzip > "$ARCHIVE_PATH/$index.json.gz"
        
        # Verify archive was created
        if [[ -f "$ARCHIVE_PATH/$index.json.gz" ]]; then
            log "Index $index archived successfully"
            
            # Delete the index from Elasticsearch
            curl -X DELETE "$ELASTICSEARCH_HOST/$index"
            log "Index $index deleted from Elasticsearch"
        else
            error "Failed to archive index $index"
        fi
    done
}

# Clean up old archives
cleanup_old_archives() {
    log "Cleaning up old archives..."
    
    if [[ -d "$ARCHIVE_PATH" ]]; then
        find "$ARCHIVE_PATH" -name "*.json.gz" -mtime +$ARCHIVE_RETENTION_DAYS -delete
        log "Old archives cleaned up (older than $ARCHIVE_RETENTION_DAYS days)"
    fi
}

# Backup current logs
backup_logs() {
    log "Creating backup of current logs..."
    
    mkdir -p "$BACKUP_PATH"
    BACKUP_FILE="$BACKUP_PATH/tradeflow-logs-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    # Backup file logs
    if [[ -d "/var/log/tradeflow" ]]; then
        tar -czf "$BACKUP_FILE" -C /var/log tradeflow/
        log "File logs backed up to $BACKUP_FILE"
    fi
    
    # Backup Elasticsearch indices
    curl -X PUT "$ELASTICSEARCH_HOST/_snapshot/tradeflow-backup" \
        -H "Content-Type: application/json" \
        -d '{
            "type": "fs",
            "settings": {
                "location": "'$BACKUP_PATH'/elasticsearch"
            }
        }'
    
    SNAPSHOT_NAME="backup-$(date +%Y%m%d-%H%M%S)"
    curl -X PUT "$ELASTICSEARCH_HOST/_snapshot/tradeflow-backup/$SNAPSHOT_NAME" \
        -H "Content-Type: application/json" \
        -d '{
            "indices": "tradeflow-*",
            "ignore_unavailable": true,
            "include_global_state": false
        }'
    
    log "Elasticsearch snapshot created: $SNAPSHOT_NAME"
}

# Monitor disk usage
monitor_disk_usage() {
    log "Monitoring disk usage..."
    
    # Check Elasticsearch data directory
    ES_DATA_USAGE=$(curl -s "$ELASTICSEARCH_HOST/_nodes/stats/fs" | \
        jq -r '.nodes | to_entries[] | .value.fs.total.available_in_bytes' | \
        awk '{sum+=$1} END {print sum}')
    
    # Check log directory
    if [[ -d "/var/log/tradeflow" ]]; then
        LOG_DIR_SIZE=$(du -sb /var/log/tradeflow | cut -f1)
        log "Log directory size: $(numfmt --to=iec $LOG_DIR_SIZE)"
    fi
    
    # Alert if disk usage is high
    DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $DISK_USAGE -gt 80 ]]; then
        warn "Disk usage is high: ${DISK_USAGE}%"
    fi
}

# Generate log statistics
generate_stats() {
    log "Generating log statistics..."
    
    # Get log counts by service
    curl -s "$ELASTICSEARCH_HOST/tradeflow-*/_search" \
        -H "Content-Type: application/json" \
        -d '{
            "size": 0,
            "aggs": {
                "services": {
                    "terms": {
                        "field": "service",
                        "size": 10
                    }
                },
                "log_levels": {
                    "terms": {
                        "field": "level",
                        "size": 10
                    }
                },
                "daily_logs": {
                    "date_histogram": {
                        "field": "@timestamp",
                        "calendar_interval": "day"
                    }
                }
            }
        }' | jq '.'
}

# Main execution
main() {
    log "Starting TradeFlow log management..."
    
    case "${1:-all}" in
        "setup")
            check_elasticsearch
            create_ilm_policy
            create_index_templates
            ;;
        "archive")
            check_elasticsearch
            archive_old_indices
            ;;
        "cleanup")
            cleanup_old_archives
            ;;
        "backup")
            check_elasticsearch
            backup_logs
            ;;
        "monitor")
            check_elasticsearch
            monitor_disk_usage
            ;;
        "stats")
            check_elasticsearch
            generate_stats
            ;;
        "all")
            check_elasticsearch
            create_ilm_policy
            create_index_templates
            archive_old_indices
            cleanup_old_archives
            backup_logs
            monitor_disk_usage
            ;;
        *)
            echo "Usage: $0 {setup|archive|cleanup|backup|monitor|stats|all}"
            echo ""
            echo "Commands:"
            echo "  setup   - Create ILM policies and index templates"
            echo "  archive - Archive old indices"
            echo "  cleanup - Clean up old archives"
            echo "  backup  - Create backup of current logs"
            echo "  monitor - Monitor disk usage"
            echo "  stats   - Generate log statistics"
            echo "  all     - Run all operations"
            exit 1
            ;;
    esac
    
    log "Log management completed successfully"
}

# Run main function
main "$@"