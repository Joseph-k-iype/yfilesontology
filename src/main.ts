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
  LayoutExecutor,
  OrganicLayout,
  EdgeBetweennessClustering,
  GraphEditorInputMode,
  EventRecognizers,
  IReshapeHandler,
  NodeReshapeHandleProvider,
  HandlePositions,
  HierarchicLayout,
  Matrix,
  OrganicEdgeRouter,
  OrthogonalLayout,
  CactusGroupLayout,
  ShinyPlateNodeStyle,
  GraphBuilder,
  Rect,
  INode,
} from 'yfiles';
import { enableFolding } from './lib/FoldingSupport';
import './lib/yFilesLicense';
import { initializeGraphOverview } from './graph-overview';
import { initializeTooltips } from './tooltips';
import { exportDiagram } from './diagram-export';
import { PrintingSupport } from './lib/PrintingSupport';
import { initializeContextMenu } from './context-menu';
import { initializeGraphSearch } from './graph-search';
import { parse } from 'papaparse';

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
let nodeLabelsVisible = false;
let edgeLabelsVisible = false;

async function run() {
  graphComponent = await initializeGraphComponent();
  initializeToolbar(graphComponent);
  initializeGraphOverview(graphComponent);
  initializeTooltips(graphComponent);
  initializeContextMenu(graphComponent);
  initializeGraphSearch(graphComponent);
  initializeFileUpload(graphComponent);
  initializeEdgeLabelToggle(graphComponent);
  initializeNodeLabelToggle(graphComponent);
  initializeLayoutOptions(graphComponent);
  setupLevelOfDetail(graphComponent);
  configureInteraction(graphComponent);
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

  const graph = new DefaultGraph();
  graphComponent.graph = enableFolding(graph);
  graphComponent.fitGraphBounds();

  return graphComponent;
}

function initializeToolbar(graphComponent: GraphComponent) {
  document.getElementById('btn-increase-zoom')!.addEventListener('click', () => {
    ICommand.INCREASE_ZOOM.execute(null, graphComponent);
  });

  document.getElementById('btn-decrease-zoom')!.addEventListener('click', () => {
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

  document.getElementById('btn-print')!.addEventListener('click', () => {
    const printingSupport = new PrintingSupport();
    printingSupport.printGraph(graphComponent.graph);
  });
}

function initializeFileUpload(graphComponent: GraphComponent) {
  document.getElementById('btn-load-graph')!.addEventListener('click', () => {
    const nodesFile = (document.getElementById('nodes-file-input') as HTMLInputElement).files?.[0];
    const edgesFile = (document.getElementById('edges-file-input') as HTMLInputElement).files?.[0];

    if (nodesFile && edgesFile) {
      loadGraphFromFiles(graphComponent, nodesFile, edgesFile);
    } else {
      alert('Please select both nodes and edges files.');
    }
  });
}

async function loadGraphFromFiles(graphComponent: GraphComponent, nodesFile: File, edgesFile: File) {
  const reader1 = new FileReader();
  reader1.onload = function (e) {
    const nodesCSV = e.target?.result as string;
    const nodesData = parse(nodesCSV, { header: true }).data as NodeData[];

    const reader2 = new FileReader();
    reader2.onload = async function (e) {
      const edgesCSV = e.target?.result as string;
      const edgesData = parse(edgesCSV, { header: true }).data as EdgeData[];

      // Start loading data in chunks
      await loadGraphInChunks(graphComponent, nodesData, edgesData);
    };
    reader2.readAsText(edgesFile);
  };
  reader1.readAsText(nodesFile);
}

async function loadGraphInChunks(graphComponent: GraphComponent, nodesData: NodeData[], edgesData: EdgeData[]) {
  const chunkSize = 100; // Define your chunk size
  const totalChunks = Math.ceil(nodesData.length / chunkSize);
  const progressBar = document.getElementById('progress-bar') as HTMLProgressElement;
  const progressContainer = document.getElementById('progress-container') as HTMLDivElement;
  progressContainer.style.display = 'block';
  progressBar.max = totalChunks;

  const uniqueNodesMap = new Map<string, NodeData>();

  for (let i = 0; i < totalChunks; i++) {
    const nodeChunk = nodesData.slice(i * chunkSize, (i + 1) * chunkSize);
    nodeChunk.forEach(node => uniqueNodesMap.set(node.id, node));

    const edgeChunk = edgesData.filter(edge =>
      nodeChunk.some(node => node.id === edge.source || node.id === edge.target)
    );

    await updateGraphChunk(graphComponent, Array.from(uniqueNodesMap.values()), edgeChunk);

    progressBar.value = i + 1;
  }

  progressContainer.style.display = 'none';
  graphComponent.fitGraphBounds();
  await applyClustering(graphComponent); // Ensure clustering is applied after all chunks are loaded
  createLegend(Array.from(uniqueNodesMap.values()));
}

async function updateGraphChunk(graphComponent: GraphComponent, nodesData: NodeData[], edgesData: EdgeData[]) {
  const graph = graphComponent.graph;

  const graphBuilder = new GraphBuilder(graph);
  const nodeSource = graphBuilder.createNodesSource({
    data: nodesData,
    id: 'id',
    tag: (data: NodeData) => data.type,
    layout: () => new Rect(Math.random() * 800, Math.random() * 600, 30, 30),
  });

  const edgeSource = graphBuilder.createEdgesSource({
    data: edgesData,
    sourceId: 'source',
    targetId: 'target',
  });

  const edgeStyle = new PolylineEdgeStyle({
    stroke: '2px solid black',
    targetArrow: 'default',
  });
  graph.edgeDefaults.style = edgeStyle;

  nodeSource.nodeCreator.createLabelBinding((data: NodeData) => nodeLabelsVisible ? data.label || '' : '');
  nodeSource.nodeCreator.addNodeCreatedListener((sender, event) => {
    const node = event.item as INode;
    const type = event.dataItem.type;
    const color = getColorForType(type);
    const nodeStyle = node.style as ShinyPlateNodeStyle;
    nodeStyle.fill = color;
  });

  graphBuilder.buildGraph();
}

function getColorForType(type: string): string {
  const colors: { [key: string]: string } = {
    'Type1': 'red',
    'Type2': 'blue',
    'Type3': 'green',
  };
  return colors[type] || 'gray';
}

async function applyClustering(graphComponent: GraphComponent) {
  const graph = graphComponent.graph;
  const edgeBetweennessClustering = new EdgeBetweennessClustering();
  const result = edgeBetweennessClustering.run(graph);

  const clusters: { [key: string]: INode[] } = {};

  graph.nodes.forEach(node => {
    const clusterId = result.nodeClusterIds.get(node);
    if (clusterId !== null) {
      const clusterKey = clusterId.toString();
      if (!clusters[clusterKey]) {
        clusters[clusterKey] = [];
      }
      clusters[clusterKey].push(node);
    }
  });

  const clusterColors = ['#ff6f61', '#6b5b95', '#88b04b', '#f7cac9', '#92a8d1', '#955251', '#b565a7', '#009b77', '#dd4124', '#d65076'];
  let colorIndex = 0;

  for (const clusterKey in clusters) {
    const cluster = clusters[clusterKey];
    const clusterColor = clusterColors[colorIndex % clusterColors.length];
    colorIndex++;
    cluster.forEach(node => {
      graph.setStyle(node, new ShinyPlateNodeStyle({ fill: clusterColor }));
    });
  }

  const nodesToRemove = graph.nodes.filter(node => graph.degree(node) === 0).toArray();
  nodesToRemove.forEach(node => graph.remove(node));

  await applyInitialLayout(graphComponent);
}

async function applyInitialLayout(graphComponent: GraphComponent) {
  const layout = new OrganicLayout();
  layout.minimumNodeDistance = 40;
  layout.nodeOverlapsAllowed = false;

  const layoutExecutor = new LayoutExecutor({
    graphComponent,
    layout,
    duration: '2s',
    animateViewport: true,
  });
  await layoutExecutor.start();

  applyIsometricProjection(graphComponent);
}

function applyIsometricProjection(graphComponent: GraphComponent) {
  const isometricMatrix = Matrix.ISOMETRIC;
  graphComponent.projection = isometricMatrix;
}

function initializeEdgeLabelToggle(graphComponent: GraphComponent) {
  document.getElementById('btn-toggle-edge-labels')!.addEventListener('click', () => {
    edgeLabelsVisible = !edgeLabelsVisible;
    if (edgeLabelsVisible) {
      showEdgeLabels(graphComponent);
    } else {
      hideEdgeLabels(graphComponent);
    }
  });
}

function showEdgeLabels(graphComponent: GraphComponent) {
  graphComponent.graph.edges.forEach(edge => {
    if (edge.labels.size === 0 && edge.tag.edgeType) {
      graphComponent.graph.addLabel(edge, edge.tag.edgeType);
    }
  });
}

function hideEdgeLabels(graphComponent: GraphComponent) {
  const graph = graphComponent.graph;
  const edges = graph.edges.toArray();
  edges.forEach(edge => {
    const labels = edge.labels.toArray();
    labels.forEach(label => {
      graph.remove(label);
    });
  });
}

function initializeNodeLabelToggle(graphComponent: GraphComponent) {
  document.getElementById('btn-toggle-node-labels')!.addEventListener('click', () => {
    nodeLabelsVisible = !nodeLabelsVisible;
    if (nodeLabelsVisible) {
      showNodeLabels(graphComponent);
    } else {
      hideNodeLabels(graphComponent);
    }
  });
}

function showNodeLabels(graphComponent: GraphComponent) {
  graphComponent.graph.nodes.forEach(node => {
    if (node.labels.size === 0 && node.tag.label) {
      graphComponent.graph.addLabel(node, node.tag.label);
    }
  });
}

function hideNodeLabels(graphComponent: GraphComponent) {
  const graph = graphComponent.graph;
  const nodes = graph.nodes.toArray();
  nodes.forEach(node => {
    const labels = node.labels.toArray();
    labels.forEach(label => {
      graph.remove(label);
    });
  });
}

function initializeLayoutOptions(graphComponent: GraphComponent) {
  document.getElementById('btn-apply-layout')!.addEventListener('click', async () => {
    const layoutOption = (document.getElementById('layout-options') as HTMLSelectElement).value;
    let layout;
    switch (layoutOption) {
      case 'hierarchic':
        layout = new HierarchicLayout();
        break;
      case 'organic':
        layout = new OrganicLayout();
        break;
      case 'orthogonal':
        layout = new OrthogonalLayout();
        break;
      case 'circular':
        layout = new CactusGroupLayout();
        break;
      default:
        layout = new OrganicLayout(); // Default to OrganicLayout
        break;
    }

    const layoutExecutor = new LayoutExecutor(graphComponent, layout);
    await layoutExecutor.start();

    applyOrganicEdgeRouting(graphComponent);
  });
}

function applyOrganicEdgeRouting(graphComponent: GraphComponent) {
  const graph = graphComponent.graph;
  const edgeRouter = new OrganicEdgeRouter();

  const layoutExecutor = new LayoutExecutor({
    graphComponent,
    layout: edgeRouter,
    duration: '1s',
    animateViewport: true,
  });
  layoutExecutor.start().catch(error => {
    console.error('Edge routing failed: ' + error);
  });
}

function setupLevelOfDetail(graphComponent: GraphComponent) {
  const graph = graphComponent.graph;

  graphComponent.addZoomChangedListener(() => {
    const zoom = graphComponent.zoom;
    const showLabels = zoom > 0.7;

    graph.nodes.forEach(node => {
      node.labels.toArray().forEach(label => {
        if (showLabels && !label.tag) {
          label.tag = 'visible';
        } else if (!showLabels && label.tag === 'visible') {
          label.tag = 'hidden';
          graph.remove(label);
        } else if (showLabels && label.tag === 'hidden') {
          graph.addLabel(node, label.text, label.layoutParameter);
          label.tag = 'visible';
        }
      });
    });

    graph.edges.forEach(edge => {
      edge.labels.toArray().forEach(label => {
        if (showLabels && !label.tag) {
          label.tag = 'visible';
        } else if (!showLabels && label.tag === 'visible') {
          label.tag = 'hidden';
          graph.remove(label);
        } else if (showLabels && label.tag === 'hidden') {
          graph.addLabel(edge, label.text, label.layoutParameter);
          label.tag = 'visible';
        }
      });
    });
  });
}

function createLegend(nodesData: NodeData[]) {
  const existingLegend = document.getElementById('node-type-legend');
  if (existingLegend) {
    existingLegend.remove();
  }

  const typeColorMap = getTypeColorMap(nodesData);
  const legendContainer = document.createElement('div');
  legendContainer.id = 'node-type-legend';
  legendContainer.style.position = 'absolute';
  legendContainer.style.top = '50px';
  legendContainer.style.right = '10px';
  legendContainer.style.backgroundColor = 'white';
  legendContainer.style.border = '1px solid #ccc';
  legendContainer.style.padding = '10px';
  legendContainer.style.zIndex = '1000';

  const legendTitle = document.createElement('div');
  legendTitle.style.fontWeight = 'bold';
  legendTitle.style.marginBottom = '5px';
  legendTitle.textContent = 'Node Type Legend';
  legendContainer.appendChild(legendTitle);

  for (const [type, color] of Object.entries(typeColorMap)) {
    const legendItem = document.createElement('div');
    legendItem.style.display = 'flex';
    legendItem.style.alignItems = 'center';
    legendItem.style.marginBottom = '5px';

    const colorBox = document.createElement('div');
    colorBox.style.width = '15px';
    colorBox.style.height = '15px';
    colorBox.style.backgroundColor = color;
    colorBox.style.marginRight = '5px';
    legendItem.appendChild(colorBox);

    const typeLabel = document.createElement('div');
    typeLabel.textContent = type;
    legendItem.appendChild(typeLabel);

    legendContainer.appendChild(legendItem);
  }

  document.body.appendChild(legendContainer);
}

function getTypeColorMap(nodesData: NodeData[]): { [key: string]: string } {
  const typeColorMap: { [key: string]: string } = {};
  const colors = ['#ff6f61', '#6b5b95', '#88b04b', '#f7cac9', '#92a8d1', '#955251', '#b565a7', '#009b77', '#dd4124', '#d65076'];
  let colorIndex = 0;

  nodesData.forEach(node => {
    if (!typeColorMap[node.type]) {
      typeColorMap[node.type] = colors[colorIndex % colors.length];
      colorIndex++;
    }
  });

  return typeColorMap;
}

function configureInteraction(graphComponent: GraphComponent) {
  const inputMode = new GraphEditorInputMode({
    allowGroupingOperations: true,
    allowClipboardOperations: true,
  });

  graphComponent.graph.decorator.edgeDecorator.positionHandlerDecorator.hideImplementation();

  graphComponent.graph.decorator.nodeDecorator.reshapeHandleProviderDecorator.setFactory(node => {
    const keepAspectRatio = new NodeReshapeHandleProvider(
      node,
      node.lookup(IReshapeHandler.$class) as IReshapeHandler,
      HandlePositions.BORDER
    );
    keepAspectRatio.ratioReshapeRecognizer = EventRecognizers.ALWAYS;
    return keepAspectRatio;
  });

  graphComponent.inputMode = inputMode;
}

run();
