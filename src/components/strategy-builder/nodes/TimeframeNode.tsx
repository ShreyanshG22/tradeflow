
import { Clock } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';

export function TimeframeNode({ data }: { data: { label: string } }) {
  return (
    <div className="p-3 rounded-md border border-sky-500 bg-sky-50 dark:bg-sky-900/20 shadow-sm w-48">
      <div className="flex items-center gap-2 font-medium text-sky-700 dark:text-sky-300">
        <Clock className="h-4 w-4" />
        <div>{data.label}</div>
      </div>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-sky-500" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-sky-500" />
    </div>
  );
}
