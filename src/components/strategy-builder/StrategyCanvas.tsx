
import { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ReactFlowProvider,
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { EntryNode } from './nodes/EntryNode';
import { ExitNode } from './nodes/ExitNode';
import { IndicatorNode } from './nodes/IndicatorNode';
import { PositionSizeNode } from './nodes/PositionSizeNode';

const initialNodes = [
  {
    id: 'welcome',
    type: 'default',
    position: { x: 250, y: 150 },
    data: { label: 'Drag & drop strategy blocks from the left panel' },
    className: 'rounded-md bg-muted/30 text-muted-foreground'
  },
];

const initialEdges: any[] = [];

const nodeTypes = {
  'entry-price-above': EntryNode,
  'entry-price-below': EntryNode,
  'entry-crossover': EntryNode,
  'exit-take-profit': ExitNode,
  'exit-stop-loss': ExitNode,
  'exit-trailing-stop': ExitNode,
  'indicator-rsi': IndicatorNode,
  'indicator-macd': IndicatorNode,
  'indicator-bollinger': IndicatorNode,
  'size-fixed': PositionSizeNode,
  'size-percent': PositionSizeNode,
  'size-risk': PositionSizeNode,
};

const StrategyCanvasInner = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData('application/reactflow');
      
      // Check if the dropped element is valid
      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      };

      // Generate a unique ID
      const newNode = {
        id: `${type}-${nodes.length + 1}`,
        type,
        position,
        data: { label: type.split('-').slice(1).join(' ').replace(/\b\w/g, l => l.toUpperCase()) },
      };

      // Remove the welcome node if it exists when dropping the first custom node
      if (nodes.length === 1 && nodes[0].id === 'welcome') {
        setNodes([newNode]);
      } else {
        setNodes((nds) => nds.concat(newNode));
      }
    },
    [nodes, setNodes],
  );

  const onClearCanvas = () => {
    setNodes([initialNodes[0]]);
    setEdges([]);
  };

  return (
    <div className="h-full w-full" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
      >
        <Background color="#aaa" gap={16} />
        <Controls />
        <MiniMap />
        <Panel position="top-right">
          <Button
            variant="outline"
            size="sm"
            onClick={onClearCanvas}
            className="bg-background"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Canvas
          </Button>
        </Panel>
      </ReactFlow>
    </div>
  );
};

export function StrategyCanvas() {
  return (
    <ReactFlowProvider>
      <StrategyCanvasInner />
    </ReactFlowProvider>
  );
}
