import './assets/icons/icons.css';
import './style.css';
import './dialog.css';
import {
  GraphComponent,
  GraphViewerInputMode,
  ICommand,
  ScrollBarVisibility,
  DefaultGraph,
  PolylineEdgeStyle,
  OrganicLayout,
  ShinyPlateNodeStyle,
  GraphBuilder,
  Rect,
  INode,
  Matrix,
  LayoutExecutor,
  OrganicEdgeRouter,
  ExteriorLabelModel,
  ExteriorLabelModelPosition,
} from 'yfiles';
import { enableFolding } from './lib/FoldingSupport';
import './lib/yFilesLicense';
import { initializeGraphOverview } from './graph-overview';
import { initializeTooltips } from './tooltips';
import { exportDiagram } from './diagram-export';
import { initializeContextMenu } from './context-menu';
import { initializeGraphSearch } from './graph-search';
import Papa from 'papaparse';

interface NodeData {
  id: string;
  type: string;
  label?: string;
}

interface EdgeData {
  source: string;
  target: string;
}

let graphComponent: GraphComponent;
let nodeLabelsVisible = true;
const colorPalette = [
  '#FF5733', '#33FF57', '#3357FF', '#FF33A8', '#FF8C33', '#33FF8C', '#8C33FF', '#FFD633',
  '#33FFF3', '#F333FF', '#33FFBD', '#FF336E', '#33D1FF', '#FF8333', '#BFFF33', '#FF33F1'
];
const typeColors: { [key: string]: string } = {};

async function run() {
  graphComponent = await initializeGraphComponent();
  initializeToolbar(graphComponent);
  initializeGraphOverview(graphComponent);
  initializeTooltips(graphComponent);
  initializeContextMenu(graphComponent);
  initializeGraphSearch(graphComponent);
  createLegend();
}

async function initializeGraphComponent(): Promise<GraphComponent> {
  const graphComponent = new GraphComponent(
    document.querySelector('.graph-component-container')!
  );

  graphComponent.horizontalScrollBarPolicy = ScrollBarVisibility.AS_NEEDED_DYNAMIC;
  graphComponent.verticalScrollBarPolicy = ScrollBarVisibility.AS_NEEDED_DYNAMIC;

  const mode = new GraphViewerInputMode();
  mode.navigationInputMode.allowCollapseGroup = true;
  mode.navigationInputMode.allowEnterGroup = true;
  mode.navigationInputMode.allowExitGroup = true;
  mode.navigationInputMode.allowExpandGroup = true;
  graphComponent.inputMode = mode;

  graphComponent.graph = enableFolding(new DefaultGraph());

  return graphComponent;
}

function initializeToolbar(graphComponent: GraphComponent) {
  document
    .getElementById('btn-increase-zoom')!
    .addEventListener('click', () => {
      ICommand.INCREASE_ZOOM.execute(null, graphComponent);
    });

  document
    .getElementById('btn-decrease-zoom')!
    .addEventListener('click', () => {
      ICommand.DECREASE_ZOOM.execute(null, graphComponent);
    });

  document.getElementById('btn-fit-graph')!.addEventListener('click', () => {
    ICommand.FIT_GRAPH_BOUNDS.execute(null, graphComponent);
  });

  document.getElementById('btn-export-svg')!.addEventListener('click', () => {
    exportDiagram(graphComponent, 'svg');
  });

  document.getElementById('btn-export-png')!.addEventListener('click', () => {
    exportDiagram(graphComponent, 'png');
  });

  document.getElementById('btn-export-pdf')!.addEventListener('click', () => {
    exportDiagram(graphComponent, 'pdf');
  });

  document.getElementById('nodes-file-input')!.addEventListener('change', handleFileUpload);
  document.getElementById('edges-file-input')!.addEventListener('change', handleFileUpload);

  document.getElementById('btn-toggle-node-labels')!.addEventListener('click', () => {
    nodeLabelsVisible = !nodeLabelsVisible;
    toggleNodeLabels(nodeLabelsVisible);
  });
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const file = input.files[0];
  const fileType = input.id === 'nodes-file-input' ? 'nodes' : 'edges';

  const fileData = await file.text();
  const parsedData = Papa.parse(fileData, { header: true }).data;

  if (fileType === 'nodes') {
    (window as any).uploadedNodes = parsedData;
  } else {
    (window as any).uploadedEdges = parsedData;
  }

  if ((window as any).uploadedNodes && (window as any).uploadedEdges) {
    loadAndProcessCSVFiles(graphComponent, (window as any).uploadedNodes, (window as any).uploadedEdges);
  }
}

async function loadAndProcessCSVFiles(graphComponent: GraphComponent, nodes: NodeData[], edges: EdgeData[]) {
  // Remove duplicate nodes
  const uniqueNodes = Array.from(new Map(nodes.map(node => [node.id, node])).values());

  const graphBuilder = new GraphBuilder(graphComponent.graph);

  const nodeSource = graphBuilder.createNodesSource({
    data: uniqueNodes,
    id: 'id',
    tag: (data: NodeData) => data.type,
    layout: () => new Rect(Math.random() * 800, Math.random() * 600, 30, 30),
  });

  const edgeSource = graphBuilder.createEdgesSource({
    data: edges,
    sourceId: 'source',
    targetId: 'target'
  });

  const edgeStyle = new PolylineEdgeStyle({
    stroke: '2px solid black',
    targetArrow: 'default'
  });
  graphComponent.graph.edgeDefaults.style = edgeStyle;

  nodeSource.nodeCreator.createLabelBinding((data: NodeData) => data.label || '');
  nodeSource.nodeCreator.addNodeCreatedListener((sender, event) => {
    const node = event.item as INode;
    const type = event.dataItem.type;
    if (!typeColors[type]) {
      typeColors[type] = colorPalette[Object.keys(typeColors).length % colorPalette.length];
    }
    const color = typeColors[type];
    const nodeStyle = new ShinyPlateNodeStyle({ fill: color });
    graphComponent.graph.setStyle(node, nodeStyle); // Set the style for the node
  });

  const labelModel = new ExteriorLabelModel({ insets: 5 });
  nodeSource.nodeCreator.addNodeCreatedListener((sender, args) => {
    const label = args.item.labels.first();
    if (label) {
      graphComponent.graph.setLabelLayoutParameter(label, labelModel.createParameter(ExteriorLabelModelPosition.SOUTH));
    }
  });

  graphBuilder.buildGraph();

  // Apply OrganicLayout with specific settings
  const layout = new OrganicLayout();
  layout.minimumNodeDistance = 40;
  layout.nodeOverlapsAllowed = false;
  await graphComponent.morphLayout(layout, '1s');

  // Apply OrganicEdgeRouter for edge bundling
  const edgeRouter = new OrganicEdgeRouter();
  const layoutExecutor = new LayoutExecutor({
    graphComponent,
    layout: edgeRouter,
    duration: '1s',
    animateViewport: true,
  });
  await layoutExecutor.start();

  // Apply isometric projection to the final node positions
  applyIsometricProjection(graphComponent);

  graphComponent.fitGraphBounds();
  graphComponent.zoom = 1.0; // Default zoom ratio

  // Update the legend with dynamically assigned colors
  createLegend();
}

function applyIsometricProjection(graphComponent: GraphComponent) {
  const isometricMatrix = new Matrix(
    Math.cos(Math.PI / 6), -Math.cos(Math.PI / 6),
    Math.sin(Math.PI / 6), Math.sin(Math.PI / 6),
    0, 0
  );
  graphComponent.projection = isometricMatrix;
}

function getColorForType(type: string): string {
  if (!typeColors[type]) {
    typeColors[type] = colorPalette[Object.keys(typeColors).length % colorPalette.length];
  }
  return typeColors[type];
}

function createLegend() {
  const legendContainer = document.getElementById('legend') || document.createElement('div');
  legendContainer.id = 'legend';
  legendContainer.innerHTML = ''; // Clear existing content
  legendContainer.style.position = 'absolute';
  legendContainer.style.right = '10px';
  legendContainer.style.top = '10px';
  legendContainer.style.backgroundColor = 'white';
  legendContainer.style.border = '1px solid black';
  legendContainer.style.padding = '10px';

  const legendTitle = document.createElement('div');
  legendTitle.style.fontWeight = 'bold';
  legendTitle.style.marginBottom = '5px';
  legendTitle.textContent = 'Node Type Legend';
  legendContainer.appendChild(legendTitle);

  for (const type in typeColors) {
    const legendItem = document.createElement('div');
    legendItem.style.display = 'flex';
    legendItem.style.alignItems = 'center';
    legendItem.style.marginBottom = '5px';

    const colorBox = document.createElement('div');
    colorBox.style.width = '15px';
    colorBox.style.height = '15px';
    colorBox.style.backgroundColor = typeColors[type];
    colorBox.style.marginRight = '5px';
    legendItem.appendChild(colorBox);

    const typeLabel = document.createElement('span');
    typeLabel.textContent = type;
    legendItem.appendChild(typeLabel);

    legendContainer.appendChild(legendItem);
  }

  document.body.appendChild(legendContainer);
}

function toggleNodeLabels(visible: boolean) {
  const graph = graphComponent.graph;
  graph.nodes.forEach(node => {
    if (visible) {
      const labelModel = new ExteriorLabelModel({ insets: 5 });
      if (node.labels.size === 0) {
        graph.addLabel(node, node.tag, labelModel.createParameter(ExteriorLabelModelPosition.SOUTH));
      }
    } else {
      node.labels.toArray().forEach(label => {
        graph.remove(label);
      });
    }
  });
}

run();
