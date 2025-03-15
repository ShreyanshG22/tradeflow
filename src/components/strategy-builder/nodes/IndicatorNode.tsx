
import { Activity } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';

export function IndicatorNode({ data }: { data: { label: string } }) {
  return (
    <div className="p-3 rounded-md border border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm w-48">
      <div className="flex items-center gap-2 font-medium text-blue-700 dark:text-blue-300">
        <Activity className="h-4 w-4" />
        <div>{data.label}</div>
      </div>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500" />
    </div>
  );
}
