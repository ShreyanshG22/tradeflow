
import { ArrowDownToLine } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';

type EntryNodeProps = {
  data: { label: string },
  selected?: boolean
};

export function EntryNode({ data, selected }: EntryNodeProps) {
  return (
    <div className={`p-3 rounded-md border border-green-500 bg-green-50 dark:bg-green-900/20 shadow-sm w-48 ${selected ? 'ring-2 ring-green-500' : ''}`}>
      <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-300">
        <ArrowDownToLine className="h-4 w-4" />
        <div>{data.label}</div>
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-green-500" />
    </div>
  );
}
