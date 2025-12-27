import * as si from 'systeminformation';
import { CentralizedLogger } from '@tradeflow/logging';
import { SystemMetrics } from './types';

export class SystemMonitor {
  private logger: CentralizedLogger;
  private metricsHistory: SystemMetrics[] = [];
  private maxHistorySize: number;

  constructor(logger: CentralizedLogger, maxHistorySize: number = 1000) {
    this.logger = logger;
    this.maxHistorySize = maxHistorySize;
  }

  async collectSystemMetrics(): Promise<SystemMetrics> {
    try {
      const [cpu, memory, disk, network, processes] = await Promise.all([
        this.getCpuMetrics(),
        this.getMemoryMetrics(),
        this.getDiskMetrics(),
        this.getNetworkMetrics(),
        this.getProcessMetrics()
      ]);

      const metrics: SystemMetrics = {
        cpu,
        memory,
        disk,
        network,
        processes
      };

      // Store in history
      this.metricsHistory.push(metrics);
      if (this.metricsHistory.length > this.maxHistorySize) {
        this.metricsHistory.shift();
      }

      return metrics;
    } catch (error) {
      this.logger.error('Failed to collect system metrics', error as Error);
      throw error;
    }
  }

  private async getCpuMetrics() {
    const [cpuLoad, cpuInfo] = await Promise.all([
      si.currentLoad(),
      si.cpu()
    ]);

    return {
      usage: Math.round(cpuLoad.currentLoad * 100) / 100,
      loadAverage: cpuLoad.avgLoad ? [
        cpuLoad.avgLoad,
        0, // 5-minute average not available in systeminformation
        0  // 15-minute average not available in systeminformation
      ] : [0, 0, 0],
      cores: cpuInfo.cores || 1
    };
  }

  private async getMemoryMetrics() {
    const memory = await si.mem();
    
    return {
      total: memory.total,
      used: memory.used,
      free: memory.free,
      usage: Math.round((memory.used / memory.total) * 10000) / 100
    };
  }

  private async getDiskMetrics() {
    const disks = await si.fsSize();
    
    // Aggregate all disk usage
    const totalDisk = disks.reduce((acc, disk) => ({
      total: acc.total + disk.size,
      used: acc.used + disk.used,
      free: acc.free + disk.available
    }), { total: 0, used: 0, free: 0 });

    return {
      ...totalDisk,
      usage: totalDisk.total > 0 
        ? Math.round((totalDisk.used / totalDisk.total) * 10000) / 100 
        : 0
    };
  }

  private async getNetworkMetrics() {
    const networkStats = await si.networkStats();
    
    // Aggregate all network interfaces
    const totalNetwork = networkStats.reduce((acc, iface) => ({
      bytesReceived: acc.bytesReceived + (iface.rx_bytes || 0),
      bytesSent: acc.bytesSent + (iface.tx_bytes || 0),
      packetsReceived: acc.packetsReceived + (iface.rx_packets || 0),
      packetsSent: acc.packetsSent + (iface.tx_packets || 0)
    }), { bytesReceived: 0, bytesSent: 0, packetsReceived: 0, packetsSent: 0 });

    return totalNetwork;
  }

  private async getProcessMetrics() {
    const processes = await si.processes();
    
    return {
      total: processes.all || 0,
      running: processes.running || 0,
      sleeping: processes.sleeping || 0
    };
  }

  getMetricsHistory(limit?: number): SystemMetrics[] {
    if (limit) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  getAverageMetrics(minutes: number = 5): Partial<SystemMetrics> | null {
    const now = Date.now();
    const cutoff = now - (minutes * 60 * 1000);
    
    // Note: We don't have timestamps in SystemMetrics, so we'll use the last N entries
    const recentMetrics = this.metricsHistory.slice(-minutes);
    
    if (recentMetrics.length === 0) {
      return null;
    }

    const avgCpuUsage = recentMetrics.reduce((sum, m) => sum + m.cpu.usage, 0) / recentMetrics.length;
    const avgMemoryUsage = recentMetrics.reduce((sum, m) => sum + m.memory.usage, 0) / recentMetrics.length;
    const avgDiskUsage = recentMetrics.reduce((sum, m) => sum + m.disk.usage, 0) / recentMetrics.length;

    return {
      cpu: {
        usage: Math.round(avgCpuUsage * 100) / 100,
        loadAverage: [0, 0, 0], // Not meaningful for average
        cores: recentMetrics[0].cpu.cores
      },
      memory: {
        total: recentMetrics[recentMetrics.length - 1].memory.total,
        used: 0, // Not meaningful for average
        free: 0, // Not meaningful for average
        usage: Math.round(avgMemoryUsage * 100) / 100
      },
      disk: {
        total: recentMetrics[recentMetrics.length - 1].disk.total,
        used: 0, // Not meaningful for average
        free: 0, // Not meaningful for average
        usage: Math.round(avgDiskUsage * 100) / 100
      }
    };
  }

  async getDetailedSystemInfo() {
    try {
      const [system, osInfo, cpu, memory, disk, network] = await Promise.all([
        si.system(),
        si.osInfo(),
        si.cpu(),
        si.mem(),
        si.fsSize(),
        si.networkInterfaces()
      ]);

      return {
        system: {
          manufacturer: system.manufacturer,
          model: system.model,
          version: system.version,
          serial: system.serial,
          uuid: system.uuid
        },
        os: {
          platform: osInfo.platform,
          distro: osInfo.distro,
          release: osInfo.release,
          codename: osInfo.codename,
          kernel: osInfo.kernel,
          arch: osInfo.arch,
          hostname: osInfo.hostname,
          uptime: osInfo.uptime
        },
        cpu: {
          manufacturer: cpu.manufacturer,
          brand: cpu.brand,
          vendor: cpu.vendor,
          family: cpu.family,
          model: cpu.model,
          stepping: cpu.stepping,
          revision: cpu.revision,
          voltage: cpu.voltage,
          speed: cpu.speed,
          speedMin: cpu.speedMin,
          speedMax: cpu.speedMax,
          cores: cpu.cores,
          physicalCores: cpu.physicalCores,
          processors: cpu.processors,
          socket: cpu.socket,
          cache: cpu.cache
        },
        memory: {
          total: memory.total,
          free: memory.free,
          used: memory.used,
          active: memory.active,
          available: memory.available,
          buffers: memory.buffers,
          cached: memory.cached,
          slab: memory.slab,
          buffcache: memory.buffcache,
          swaptotal: memory.swaptotal,
          swapused: memory.swapused,
          swapfree: memory.swapfree
        },
        storage: disk.map(d => ({
          fs: d.fs,
          type: d.type,
          size: d.size,
          used: d.used,
          available: d.available,
          use: d.use,
          mount: d.mount
        })),
        network: network.map(n => ({
          iface: n.iface,
          ifaceName: n.ifaceName,
          ip4: n.ip4,
          ip6: n.ip6,
          mac: n.mac,
          internal: n.internal,
          virtual: n.virtual,
          operstate: n.operstate,
          type: n.type,
          duplex: n.duplex,
          mtu: n.mtu,
          speed: n.speed,
          dhcp: n.dhcp,
          dnsSuffix: n.dnsSuffix,
          ieee8021xAuth: n.ieee8021xAuth,
          ieee8021xState: n.ieee8021xState,
          carrierChanges: n.carrierChanges
        }))
      };
    } catch (error) {
      this.logger.error('Failed to get detailed system info', error as Error);
      throw error;
    }
  }

  clearHistory(): void {
    this.metricsHistory = [];
  }
}