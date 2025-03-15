
import { ArrowUpFromLine } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';

export function ExitNode({ data }: { data: { label: string } }) {
  return (
    <div className="p-3 rounded-md border border-red-500 bg-red-50 dark:bg-red-900/20 shadow-sm w-48">
      <div className="flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
        <ArrowUpFromLine className="h-4 w-4" />
        <div>{data.label}</div>
      </div>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-red-500" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-red-500" />
    </div>
  );
}
