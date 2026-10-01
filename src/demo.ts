import type { Host, Transition } from './types'

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const documentationAddress = (id: string) => {
  const octet = [...id].reduce((total, character) => total + character.charCodeAt(0), 0) % 220
  return `192.0.2.${octet + 10}`
}

const host = (
  id: string,
  name: string,
  room: string,
  status: Host['status'],
  changedMinutes: number,
  latency: number | null,
  groups: string[],
  options: Partial<Host> = {},
): Host => ({
  id,
  name,
  address: documentationAddress(id),
  groups,
  metadata: {
    room,
    building: room.startsWith('DC') || room === 'CORE' ? 'Example Data Centre' : 'Example Building',
    rack: `R${(id.length % 4) + 1}`,
  },
  status,
  last_checked_at: ago(0.35),
  last_change_at: ago(changedMinutes),
  latency_ms: latency,
  consecutive_successes: status === 'up' ? 18 + id.length : 0,
  consecutive_failures: status === 'down' ? Math.max(2, Math.round(changedMinutes / 2)) : 0,
  last_error: status === 'down' ? 'ICMP request timed out after 1000ms' : null,
  usage:
    status === 'down'
      ? null
      : {
          collected_at: ago(3),
          console_users: id.length % 3,
          remote_users: id.length % 2,
          status: 'ok',
          error: null,
        },
  ...options,
})

export const demoHosts: Host[] = [
  host('lab-101-ws17', 'ws17.lab101.example.org', 'LAB-101', 'down', 92, null, ['student-lab', 'linux']),
  host('lab-101-ws21', 'ws21.lab101.example.org', 'LAB-101', 'down', 67, null, ['student-lab', 'linux']),
  host('lab-101-printer', 'printer.lab101.example.org', 'LAB-101', 'unknown', 14, null, ['printers'], {
    last_error: 'No observations recorded yet',
    last_checked_at: null,
  }),
  host('lab-204-ws04', 'ws04.lab204.example.org', 'LAB-204', 'down', 1_650, null, ['student-lab', 'linux']),
  host('lab-204-ws12', 'ws12.lab204.example.org', 'LAB-204', 'down', 343, null, ['student-lab', 'linux']),
  host('lab-204-ws13', 'ws13.lab204.example.org', 'LAB-204', 'up', 240, 1.8, ['student-lab', 'linux']),
  host('lab-204-switch1', 'switch01.lab204.example.org', 'LAB-204', 'up', 9_180, 0.7, ['network', 'switches']),
  host('studio-2-mac02', 'mac02.studio2.example.org', 'STUDIO-2', 'down', 4_431, null, ['creative', 'macos']),
  host('studio-2-mac06', 'mac06.studio2.example.org', 'STUDIO-2', 'down', 31, null, ['creative', 'macos']),
  host('studio-2-ap01', 'ap01.studio2.example.org', 'STUDIO-2', 'up', 31_680, 2.4, ['network', 'access-points']),
  host('lab-310-ws02', 'ws02.lab310.example.org', 'LAB-310', 'down', 12, null, ['student-lab', 'linux']),
  host('lab-310-ws09', 'ws09.lab310.example.org', 'LAB-310', 'up', 5_760, 3.1, ['student-lab', 'linux']),
  host('lab-310-ws10', 'ws10.lab310.example.org', 'LAB-310', 'up', 4_320, 2.8, ['student-lab', 'linux']),
  host('lab-315-ws07', 'ws07.lab315.example.org', 'LAB-315', 'down', 8, null, ['student-lab', 'linux']),
  host('lab-315-ws08', 'ws08.lab315.example.org', 'LAB-315', 'up', 950, 1.5, ['student-lab', 'linux']),
  host('lab-315-display', 'display.lab315.example.org', 'LAB-315', 'unknown', 52, null, ['av'], {
    last_error: 'Host disabled for ICMP checks',
  }),
  host('dc-1-node01', 'compute01.dc1.example.org', 'DC-1', 'up', 11_520, 0.9, ['compute', 'linux']),
  host('dc-1-node02', 'compute02.dc1.example.org', 'DC-1', 'up', 11_520, 1.1, ['compute', 'linux']),
  host('dc-1-node03', 'compute03.dc1.example.org', 'DC-1', 'down', 189, null, ['compute', 'linux']),
  host('class-201-ws03', 'ws03.class201.example.org', 'CLASS-201', 'up', 2_910, 1.9, ['teaching', 'linux']),
  host('class-201-ws05', 'ws05.class201.example.org', 'CLASS-201', 'up', 2_910, 2.2, ['teaching', 'linux']),
  host('class-201-ws11', 'ws11.class201.example.org', 'CLASS-201', 'down', 2_307, null, ['teaching', 'linux']),
  host('conf-4-ap01', 'ap01.conf4.example.org', 'CONF-4', 'up', 21_180, 1.3, ['network', 'access-points']),
  host('conf-4-ap02', 'ap02.conf4.example.org', 'CONF-4', 'up', 21_180, 1.1, ['network', 'access-points']),
  host('conf-4-panel', 'panel.conf4.example.org', 'CONF-4', 'unknown', 22, null, ['av']),
  host('lab-407-ws01', 'ws01.lab407.example.org', 'LAB-407', 'down', 71, null, ['student-lab', 'linux']),
  host('lab-407-ws02', 'ws02.lab407.example.org', 'LAB-407', 'up', 2_440, 4.2, ['student-lab', 'linux']),
  host('core-router-01', 'router01.core.example.org', 'CORE', 'up', 84_300, 0.4, ['core', 'routers']),
  host('core-router-02', 'router02.core.example.org', 'CORE', 'up', 84_300, 0.5, ['core', 'routers']),
  host('store-1-node01', 'storage01.store1.example.org', 'STORE-1', 'up', 19_200, 0.8, ['storage', 'linux']),
  host('store-1-node02', 'storage02.store1.example.org', 'STORE-1', 'up', 19_200, 0.9, ['storage', 'linux']),
  host('legacy-node-01', 'legacy01.example.org', '', 'down', 5_840, null, ['legacy']),
]

export const demoTransitions = (hostId: string): Transition[] => {
  const selected = demoHosts.find((item) => item.id === hostId)
  const isDown = selected?.status === 'down'

  return [
    {
      id: 4,
      host_id: hostId,
      previous_status: isDown ? 'up' : 'down',
      new_status: selected?.status ?? 'unknown',
      changed_at: selected?.last_change_at ?? ago(12),
      latency_ms: selected?.latency_ms ?? null,
      error: selected?.last_error ?? null,
      backend: 'raw',
      reason: isDown ? 'failure threshold reached' : 'success threshold reached',
    },
    {
      id: 3,
      host_id: hostId,
      previous_status: isDown ? 'down' : 'up',
      new_status: isDown ? 'up' : 'down',
      changed_at: ago(3_120),
      latency_ms: isDown ? 2.1 : null,
      error: isDown ? null : 'ICMP request timed out after 1000ms',
      backend: 'raw',
      reason: isDown ? 'success threshold reached' : 'failure threshold reached',
    },
    {
      id: 2,
      host_id: hostId,
      previous_status: isDown ? 'up' : 'down',
      new_status: isDown ? 'down' : 'up',
      changed_at: ago(8_540),
      latency_ms: isDown ? null : 2.6,
      error: isDown ? 'ICMP request timed out after 1000ms' : null,
      backend: 'system',
      reason: isDown ? 'failure threshold reached' : 'success threshold reached',
    },
  ]
}
