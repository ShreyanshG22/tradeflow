
import { DollarSign } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';

export function PositionSizeNode({ data }: { data: { label: string } }) {
  return (
    <div className="p-3 rounded-md border border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-sm w-48">
      <div className="flex items-center gap-2 font-medium text-purple-700 dark:text-purple-300">
        <DollarSign className="h-4 w-4" />
        <div>{data.label}</div>
      </div>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-purple-500" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-purple-500" />
    </div>
  );
}
