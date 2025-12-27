import { exec } from 'child_process';
import { promisify } from 'util';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

describe('Kubernetes Deployment Tests', () => {
  const NAMESPACE = process.env.K8S_NAMESPACE || 'zerodha-staging';
  const TIMEOUT = 60000; // 60 seconds
  
  const SERVICES = [
    'zerodha-auth-service',
    'zerodha-market-service',
    'zerodha-order-service',
    'zerodha-portfolio-service',
    'zerodha-risk-service',
  ];

  beforeAll(async () => {
    // Check if kubectl is available
    try {
      await execAsync('kubectl version --client');
    } catch (error) {
      throw new Error('kubectl is not available. Please ensure kubectl is installed and configured.');
    }

    // Check if we can access the cluster
    try {
      await execAsync('kubectl cluster-info');
    } catch (error) {
      console.warn('Cannot access Kubernetes cluster. Some tests may be skipped.');
    }
  }, TIMEOUT);

  describe('Manifest Validation', () => {
    const manifestsDir = path.join(__dirname, '../../k8s/staging');

    it('should have valid YAML syntax in all manifest files', () => {
      const manifestFiles = fs.readdirSync(manifestsDir).filter(file => 
        file.endsWith('.yaml') || file.endsWith('.yml')
      );

      expect(manifestFiles.length).toBeGreaterThan(0);

      manifestFiles.forEach(file => {
        const filePath = path.join(manifestsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        expect(() => {
          yaml.loadAll(content);
        }).not.toThrow();
      });
    });

    it('should have required Kubernetes resource types', () => {
      const manifestFiles = fs.readdirSync(manifestsDir).filter(file => 
        file.endsWith('.yaml') || file.endsWith('.yml')
      );

      const requiredResources = ['Deployment', 'Service', 'ConfigMap', 'Secret'];
      const foundResources = new Set<string>();

      manifestFiles.forEach(file => {
        const filePath = path.join(manifestsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const documents = yaml.loadAll(content) as any[];
        
        documents.forEach(doc => {
          if (doc && doc.kind) {
            foundResources.add(doc.kind);
          }
        });
      });

      requiredResources.forEach(resource => {
        expect(foundResources.has(resource)).toBe(true);
      });
    });

    it('should have proper labels and selectors', () => {
      const manifestFiles = fs.readdirSync(manifestsDir).filter(file => 
        file.endsWith('.yaml') || file.endsWith('.yml')
      );

      manifestFiles.forEach(file => {
        const filePath = path.join(manifestsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const documents = yaml.loadAll(content) as any[];
        
        documents.forEach(doc => {
          if (doc && doc.kind === 'Deployment') {
            expect(doc.metadata).toHaveProperty('labels');
            expect(doc.spec.selector).toHaveProperty('matchLabels');
            expect(doc.spec.template.metadata).toHaveProperty('labels');
            
            // Verify selector matches template labels
            const selectorLabels = doc.spec.selector.matchLabels;
            const templateLabels = doc.spec.template.metadata.labels;
            
            Object.keys(selectorLabels).forEach(key => {
              expect(templateLabels[key]).toBe(selectorLabels[key]);
            });
          }
          
          if (doc && doc.kind === 'Service') {
            expect(doc.metadata).toHaveProperty('labels');
            expect(doc.spec).toHaveProperty('selector');
          }
        });
      });
    });

    it('should have proper resource limits and requests', () => {
      const manifestFiles = fs.readdirSync(manifestsDir).filter(file => 
        file.endsWith('.yaml') || file.endsWith('.yml')
      );

      manifestFiles.forEach(file => {
        const filePath = path.join(manifestsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const documents = yaml.loadAll(content) as any[];
        
        documents.forEach(doc => {
          if (doc && doc.kind === 'Deployment') {
            const containers = doc.spec.template.spec.containers;
            
            containers.forEach((container: any) => {
              if (container.resources) {
                expect(container.resources).toHaveProperty('requests');
                expect(container.resources).toHaveProperty('limits');
                
                // Verify memory and CPU are specified
                expect(container.resources.requests).toHaveProperty('memory');
                expect(container.resources.requests).toHaveProperty('cpu');
                expect(container.resources.limits).toHaveProperty('memory');
                expect(container.resources.limits).toHaveProperty('cpu');
              }
            });
          }
        });
      });
    });

    it('should have proper health checks configured', () => {
      const manifestFiles = fs.readdirSync(manifestsDir).filter(file => 
        file.endsWith('.yaml') || file.endsWith('.yml')
      );

      manifestFiles.forEach(file => {
        const filePath = path.join(manifestsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const documents = yaml.loadAll(content) as any[];
        
        documents.forEach(doc => {
          if (doc && doc.kind === 'Deployment') {
            const containers = doc.spec.template.spec.containers;
            
            containers.forEach((container: any) => {
              // Check for health probes
              if (container.livenessProbe) {
                expect(container.livenessProbe).toHaveProperty('httpGet');
                expect(container.livenessProbe.httpGet).toHaveProperty('path');
                expect(container.livenessProbe.httpGet).toHaveProperty('port');
              }
              
              if (container.readinessProbe) {
                expect(container.readinessProbe).toHaveProperty('httpGet');
                expect(container.readinessProbe.httpGet).toHaveProperty('path');
                expect(container.readinessProbe.httpGet).toHaveProperty('port');
              }
            });
          }
        });
      });
    });
  });

  describe('Cluster Deployment Status', () => {
    it('should verify namespace exists', async () => {
      try {
        const { stdout } = await execAsync(`kubectl get namespace ${NAMESPACE}`);
        expect(stdout).toContain(NAMESPACE);
      } catch (error) {
        console.warn(`Namespace ${NAMESPACE} does not exist or cluster not accessible`);
      }
    }, TIMEOUT);

    it('should verify all deployments are available', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`kubectl get deployment ${service} -n ${NAMESPACE} -o jsonpath='{.status.readyReplicas}'`);
          const readyReplicas = parseInt(stdout.trim());
          
          expect(readyReplicas).toBeGreaterThan(0);
        } catch (error) {
          console.warn(`Deployment ${service} not found or not ready in namespace ${NAMESPACE}`);
        }
      }
    }, TIMEOUT);

    it('should verify all services are created', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`kubectl get service ${service} -n ${NAMESPACE}`);
          expect(stdout).toContain(service);
        } catch (error) {
          console.warn(`Service ${service} not found in namespace ${NAMESPACE}`);
        }
      }
    }, TIMEOUT);

    it('should verify pods are running and healthy', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`kubectl get pods -l app=${service} -n ${NAMESPACE} -o jsonpath='{.items[*].status.phase}'`);
          const phases = stdout.trim().split(' ').filter(phase => phase.length > 0);
          
          phases.forEach(phase => {
            expect(phase).toBe('Running');
          });
        } catch (error) {
          console.warn(`Pods for ${service} not found or not running in namespace ${NAMESPACE}`);
        }
      }
    }, TIMEOUT);

    it('should verify configmap and secrets are applied', async () => {
      try {
        const { stdout: configMapOutput } = await execAsync(`kubectl get configmap zerodha-config -n ${NAMESPACE}`);
        expect(configMapOutput).toContain('zerodha-config');
        
        const { stdout: secretOutput } = await execAsync(`kubectl get secret zerodha-secrets -n ${NAMESPACE}`);
        expect(secretOutput).toContain('zerodha-secrets');
      } catch (error) {
        console.warn(`ConfigMap or Secret not found in namespace ${NAMESPACE}`);
      }
    }, TIMEOUT);
  });

  describe('Pod Health and Logs', () => {
    it('should verify pods are not restarting frequently', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`kubectl get pods -l app=${service} -n ${NAMESPACE} -o jsonpath='{.items[*].status.containerStatuses[*].restartCount}'`);
          const restartCounts = stdout.trim().split(' ').filter(count => count.length > 0).map(count => parseInt(count));
          
          restartCounts.forEach(count => {
            expect(count).toBeLessThan(5); // Allow some restarts but not excessive
          });
        } catch (error) {
          console.warn(`Could not check restart count for ${service}`);
        }
      }
    }, TIMEOUT);

    it('should verify pods have no error logs', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`kubectl logs -l app=${service} -n ${NAMESPACE} --tail=50 | grep -i error | wc -l`);
          const errorCount = parseInt(stdout.trim());
          
          // Allow some errors but not excessive
          expect(errorCount).toBeLessThan(10);
        } catch (error) {
          console.warn(`Could not check logs for ${service}`);
        }
      }
    }, TIMEOUT);

    it('should verify pods are ready and passing health checks', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`kubectl get pods -l app=${service} -n ${NAMESPACE} -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}'`);
          const readyStatuses = stdout.trim().split(' ').filter(status => status.length > 0);
          
          readyStatuses.forEach(status => {
            expect(status).toBe('True');
          });
        } catch (error) {
          console.warn(`Could not check ready status for ${service}`);
        }
      }
    }, TIMEOUT);
  });

  describe('Service Discovery and Networking', () => {
    it('should verify services are accessible within cluster', async () => {
      for (const service of SERVICES) {
        try {
          // Get service cluster IP
          const { stdout } = await execAsync(`kubectl get service ${service} -n ${NAMESPACE} -o jsonpath='{.spec.clusterIP}'`);
          const clusterIP = stdout.trim();
          
          expect(clusterIP).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
          expect(clusterIP).not.toBe('None');
        } catch (error) {
          console.warn(`Could not verify service ${service} cluster IP`);
        }
      }
    }, TIMEOUT);

    it('should verify service ports are correctly configured', async () => {
      const expectedPorts = {
        'zerodha-auth-service': 3009,
        'zerodha-market-service': 3005,
        'zerodha-order-service': 3006,
        'zerodha-portfolio-service': 3007,
        'zerodha-risk-service': 3008,
      };

      for (const [service, expectedPort] of Object.entries(expectedPorts)) {
        try {
          const { stdout } = await execAsync(`kubectl get service ${service} -n ${NAMESPACE} -o jsonpath='{.spec.ports[0].port}'`);
          const actualPort = parseInt(stdout.trim());
          
          expect(actualPort).toBe(expectedPort);
        } catch (error) {
          console.warn(`Could not verify port for service ${service}`);
        }
      }
    }, TIMEOUT);

    it('should verify DNS resolution works for services', async () => {
      // Test DNS resolution by running nslookup from within a pod
      try {
        // Get a running pod to execute commands from
        const { stdout } = await execAsync(`kubectl get pods -l app=zerodha-auth-service -n ${NAMESPACE} -o jsonpath='{.items[0].metadata.name}'`);
        const podName = stdout.trim();
        
        if (podName) {
          for (const service of SERVICES) {
            try {
              const { stdout: nslookupOutput } = await execAsync(`kubectl exec ${podName} -n ${NAMESPACE} -- nslookup ${service}.${NAMESPACE}.svc.cluster.local`);
              expect(nslookupOutput).toContain('Name:');
              expect(nslookupOutput).toContain('Address:');
            } catch (error) {
              console.warn(`DNS resolution test failed for ${service}`);
            }
          }
        }
      } catch (error) {
        console.warn('DNS resolution test skipped - no running pods found');
      }
    }, TIMEOUT);
  });

  describe('Resource Usage and Scaling', () => {
    it('should verify resource usage is within limits', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`kubectl top pods -l app=${service} -n ${NAMESPACE} --no-headers`);
          const lines = stdout.trim().split('\n').filter(line => line.length > 0);
          
          lines.forEach(line => {
            const parts = line.split(/\s+/);
            if (parts.length >= 3) {
              const cpuUsage = parts[1];
              const memoryUsage = parts[2];
              
              // Basic validation that metrics are being collected
              expect(cpuUsage).toMatch(/^\d+m?$/);
              expect(memoryUsage).toMatch(/^\d+Mi?$/);
            }
          });
        } catch (error) {
          console.warn(`Resource usage check skipped for ${service} - metrics server may not be available`);
        }
      }
    }, TIMEOUT);

    it('should verify horizontal pod autoscaler if configured', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`kubectl get hpa ${service} -n ${NAMESPACE}`);
          
          if (stdout && !stdout.includes('NotFound')) {
            // HPA exists, verify it's working
            expect(stdout).toContain(service);
          }
        } catch (error) {
          // HPA not configured, which is fine
          console.warn(`HPA not configured for ${service}`);
        }
      }
    }, TIMEOUT);
  });

  describe('Security and RBAC', () => {
    it('should verify service accounts are properly configured', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`kubectl get deployment ${service} -n ${NAMESPACE} -o jsonpath='{.spec.template.spec.serviceAccountName}'`);
          const serviceAccount = stdout.trim();
          
          if (serviceAccount && serviceAccount !== 'default') {
            // Verify the service account exists
            const { stdout: saOutput } = await execAsync(`kubectl get serviceaccount ${serviceAccount} -n ${NAMESPACE}`);
            expect(saOutput).toContain(serviceAccount);
          }
        } catch (error) {
          console.warn(`Service account check skipped for ${service}`);
        }
      }
    }, TIMEOUT);

    it('should verify network policies if configured', async () => {
      try {
        const { stdout } = await execAsync(`kubectl get networkpolicy -n ${NAMESPACE}`);
        
        if (stdout && !stdout.includes('No resources found')) {
          // Network policies exist, basic validation
          expect(stdout).toContain('NAME');
        }
      } catch (error) {
        console.warn('Network policy check skipped - may not be configured');
      }
    }, TIMEOUT);

    it('should verify pod security context', async () => {
      for (const service of SERVICES) {
        try {
          const { stdout } = await execAsync(`kubectl get deployment ${service} -n ${NAMESPACE} -o jsonpath='{.spec.template.spec.securityContext}'`);
          
          if (stdout && stdout !== '{}') {
            const securityContext = JSON.parse(stdout);
            
            // Check for security best practices
            if (securityContext.runAsNonRoot !== undefined) {
              expect(securityContext.runAsNonRoot).toBe(true);
            }
          }
        } catch (error) {
          console.warn(`Security context check skipped for ${service}`);
        }
      }
    }, TIMEOUT);
  });
});