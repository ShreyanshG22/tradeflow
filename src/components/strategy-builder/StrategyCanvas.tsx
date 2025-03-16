
import { useCallback, useRef, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  Panel,
  ConnectionLineType,
  NodeMouseHandler,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Trash2, ZoomIn, ZoomOut, Move, Undo, Redo } from 'lucide-react';
import { EntryNode } from './nodes/EntryNode';
import { ExitNode } from './nodes/ExitNode';
import { IndicatorNode } from './nodes/IndicatorNode';
import { PositionSizeNode } from './nodes/PositionSizeNode';
import { OperatorNode } from './nodes/OperatorNode';
import { TimeframeNode } from './nodes/TimeframeNode';
import { useToast } from '@/hooks/use-toast';

// Define a type for our nodes to ensure consistency
type CustomNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string };
  className?: string;
};

const initialNodes: CustomNode[] = [
  {
    id: 'welcome',
    type: 'default',
    position: { x: 250, y: 150 },
    data: { label: 'Drag & drop strategy blocks from the left panel' },
    className: 'rounded-md bg-muted/30 text-muted-foreground'
  },
];

const initialEdges: Edge[] = [];

const nodeTypes = {
  'entry-price-above': EntryNode,
  'entry-price-below': EntryNode,
  'entry-crossover': EntryNode,
  'entry-volume-spike': EntryNode,
  'entry-candlestick': EntryNode,
  'entry-market-condition': EntryNode,
  'exit-take-profit': ExitNode,
  'exit-stop-loss': ExitNode,
  'exit-trailing-stop': ExitNode,
  'exit-time-based': ExitNode,
  'exit-indicator': ExitNode,
  'indicator-rsi': IndicatorNode,
  'indicator-macd': IndicatorNode,
  'indicator-bollinger': IndicatorNode,
  'indicator-moving-avg': IndicatorNode,
  'indicator-vwap': IndicatorNode,
  'indicator-atr': IndicatorNode,
  'size-fixed': PositionSizeNode,
  'size-percent': PositionSizeNode,
  'size-risk': PositionSizeNode,
  'size-volatility': PositionSizeNode,
  'operator-and': OperatorNode,
  'operator-or': OperatorNode,
  'operator-not': OperatorNode,
  'operator-xor': OperatorNode,
  'timeframe-1min': TimeframeNode,
  'timeframe-5min': TimeframeNode,
  'timeframe-15min': TimeframeNode,
  'timeframe-1hour': TimeframeNode,
  'timeframe-daily': TimeframeNode,
};

const StrategyCanvasInner = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [undoStack, setUndoStack] = useState<Array<{nodes: Node[]; edges: Edge[]}>>([]);
  const [redoStack, setRedoStack] = useState<Array<{nodes: Node[]; edges: Edge[]}>>([]);
  const [nodesToDelete, setNodesToDelete] = useState<string[]>([]);
  const reactFlowInstance = useReactFlow();
  const { toast } = useToast();
  
  // Save current state for undo
  const saveCurrentState = useCallback(() => {
    setUndoStack(prev => [...prev, { nodes, edges }]);
    setRedoStack([]);
  }, [nodes, edges]);
  
  const onConnect = useCallback(
    (params: Connection) => {
      saveCurrentState();
      
      // Check if this would create a loop or invalid connection
      const sourceNodeType = nodes.find(n => n.id === params.source)?.type;
      const targetNodeType = nodes.find(n => n.id === params.target)?.type;
      
      // Prevent connecting the same type of nodes (e.g., entry to entry)
      if (sourceNodeType && targetNodeType && 
          sourceNodeType.split('-')[0] === targetNodeType.split('-')[0]) {
        toast({
          title: "Invalid Connection",
          description: "Cannot connect same type of nodes together.",
          variant: "destructive"
        });
        return;
      }
      
      // Allow the connection if checks pass
      setEdges((eds) => addEdge({
        ...params,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#10b981', strokeWidth: 2 }
      }, eds));
    },
    [nodes, setEdges, toast, saveCurrentState],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      saveCurrentState();

      if (!reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData('application/reactflow');
      
      // Check if the dropped element is valid
      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      // Generate a unique ID and create a new node with the required className property
      const newNode: CustomNode = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label: type.split('-').slice(1).join(' ').replace(/\b\w/g, l => l.toUpperCase()) },
        className: '' // Add empty className to satisfy the type requirement
      };

      // Remove the welcome node if it exists when dropping the first custom node
      if (nodes.length === 1 && nodes[0].id === 'welcome') {
        setNodes([newNode]);
      } else {
        setNodes((nds) => nds.concat(newNode));
      }
    },
    [nodes, setNodes, reactFlowInstance, saveCurrentState],
  );

  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    // Handle node selection or opening configuration
    console.log("Node clicked:", node);
  }, []);

  const onNodeDoubleClick: NodeMouseHandler = useCallback((event, node) => {
    // Here you would normally open a configuration modal for the node
    toast({
      title: "Configure Node",
      description: `Configure settings for ${node.data.label}`,
    });
  }, [toast]);

  const onClearCanvas = useCallback(() => {
    saveCurrentState();
    setNodes([initialNodes[0]]);
    setEdges([]);
  }, [setNodes, setEdges, saveCurrentState]);

  // Handle undo/redo
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    
    // Save current state to redo stack
    setRedoStack(prev => [...prev, { nodes, edges }]);
    
    // Pop the last state from undo stack
    const newUndoStack = [...undoStack];
    const prevState = newUndoStack.pop();
    setUndoStack(newUndoStack);
    
    // Apply the previous state
    if (prevState) {
      setNodes(prevState.nodes);
      setEdges(prevState.edges);
    }
  }, [undoStack, nodes, edges, setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    
    // Save current state to undo stack
    setUndoStack(prev => [...prev, { nodes, edges }]);
    
    // Pop the last state from redo stack
    const newRedoStack = [...redoStack];
    const nextState = newRedoStack.pop();
    setRedoStack(newRedoStack);
    
    // Apply the next state
    if (nextState) {
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
    }
  }, [redoStack, nodes, edges, setNodes, setEdges]);

  // Listen for keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Delete selected nodes with Delete key
      if (event.key === 'Delete') {
        const selectedNodes = nodes.filter(node => node.selected);
        if (selectedNodes.length > 0) {
          saveCurrentState();
          const nodeIdsToDelete = selectedNodes.map(node => node.id);
          setNodes(nodes.filter(node => !nodeIdsToDelete.includes(node.id)));
          setEdges(edges.filter(edge => 
            !nodeIdsToDelete.includes(edge.source) && !nodeIdsToDelete.includes(edge.target)
          ));
        }
      }
      
      // Undo with Ctrl/Cmd + Z
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      }
      
      // Redo with Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if ((event.ctrlKey || event.metaKey) && (
        (event.key === 'z' && event.shiftKey) || event.key === 'y'
      )) {
        event.preventDefault();
        handleRedo();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [nodes, edges, handleUndo, handleRedo, saveCurrentState, setNodes, setEdges]);

  // Listen for clearCanvas event from parent component
  useEffect(() => {
    const handleClearCanvas = () => {
      onClearCanvas();
    };
    
    window.addEventListener('clearCanvas', handleClearCanvas);
    return () => {
      window.removeEventListener('clearCanvas', handleClearCanvas);
    };
  }, [onClearCanvas]);

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
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: '#10b981', strokeWidth: 2 }}
        deleteKeyCode={null} // Disable built-in delete to use our custom implementation
      >
        <Background color="#aaa" gap={16} />
        <Controls />
        <MiniMap 
          nodeStrokeColor={(n) => {
            if (n.type?.includes('entry')) return '#10b981';
            if (n.type?.includes('exit')) return '#ef4444';
            if (n.type?.includes('indicator')) return '#3b82f6';
            if (n.type?.includes('operator')) return '#f59e0b';
            if (n.type?.includes('size')) return '#8b5cf6';
            return '#888';
          }}
          nodeColor={(n) => {
            if (n.type?.includes('entry')) return '#dcfce7';
            if (n.type?.includes('exit')) return '#fee2e2';
            if (n.type?.includes('indicator')) return '#dbeafe';
            if (n.type?.includes('operator')) return '#fef3c7';
            if (n.type?.includes('size')) return '#f3e8ff';
            return '#f5f5f5';
          }}
        />
        <Panel position="top-right" className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="bg-background"
          >
            <Undo className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="bg-background"
          >
            <Redo className="h-4 w-4" />
          </Button>
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
