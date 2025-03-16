
import { Calculator } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';

export function OperatorNode({ data }: { data: { label: string } }) {
  return (
    <div className="p-3 rounded-md border border-amber-500 bg-amber-50 dark:bg-amber-900/20 shadow-sm w-48">
      <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
        <Calculator className="h-4 w-4" />
        <div>{data.label}</div>
      </div>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-amber-500" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-amber-500" />
    </div>
  );
}
