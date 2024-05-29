import './assets/icons/icons.css'
import './style.css'
import './dialog.css'
import {
  GraphComponent,
  GraphViewerInputMode,
  ICommand,
  ScrollBarVisibility,
  DefaultGraph,
  ShapeNodeStyle,
  ExteriorLabelModel,
  PolylineEdgeStyle,
  SolidColorFill
} from 'yfiles'
import {
  HierarchicLayout,
  OrganicLayout,
  OrthogonalLayout,
  CircularLayout,
  LayoutExecutor,
  EdgeRouter
} from 'yfiles'
import { enableFolding } from './lib/FoldingSupport'
import './lib/yFilesLicense'
import { initializeGraphOverview } from './graph-overview'
import { initializeTooltips } from './tooltips'
import { exportDiagram } from './diagram-export'
import { PrintingSupport } from './lib/PrintingSupport'
import { initializeContextMenu } from './context-menu'
import { initializeGraphSearch } from './graph-search'
import { parse } from 'papaparse'

async function run() {
  const graphComponent = await initializeGraphComponent()
  initializeToolbar(graphComponent)
  initializeGraphOverview(graphComponent)
  initializeTooltips(graphComponent)
  initializeContextMenu(graphComponent)
  initializeGraphSearch(graphComponent)
  initializeFileUpload(graphComponent)
  initializeEdgeLabelToggle(graphComponent)
  initializeLayoutOptions(graphComponent)
}

async function initializeGraphComponent(): Promise<GraphComponent> {
  const graphComponent = new GraphComponent(
    document.querySelector('.graph-component-container')!
  )
  graphComponent.horizontalScrollBarPolicy = ScrollBarVisibility.AS_NEEDED_DYNAMIC
  graphComponent.verticalScrollBarPolicy = ScrollBarVisibility.AS_NEEDED_DYNAMIC

  const mode = new GraphViewerInputMode()
  mode.navigationInputMode.allowCollapseGroup = true
  mode.navigationInputMode.allowEnterGroup = true
  mode.navigationInputMode.allowExitGroup = true
  mode.navigationInputMode.allowExpandGroup = true
  graphComponent.inputMode = mode

  const graph = new DefaultGraph()
  graphComponent.graph = enableFolding(graph)
  graphComponent.fitGraphBounds()

  return graphComponent
}

function initializeToolbar(graphComponent: GraphComponent) {
  document.getElementById('btn-increase-zoom')!.addEventListener('click', () => {
    ICommand.INCREASE_ZOOM.execute(null, graphComponent)
  })

  document.getElementById('btn-decrease-zoom')!.addEventListener('click', () => {
    ICommand.DECREASE_ZOOM.execute(null, graphComponent)
  })

  document.getElementById('btn-fit-graph')!.addEventListener('click', () => {
    ICommand.FIT_GRAPH_BOUNDS.execute(null, graphComponent)
  })

  document.getElementById('btn-export-svg')!.addEventListener('click', () => {
    exportDiagram(graphComponent, 'svg')
  })

  document.getElementById('btn-export-png')!.addEventListener('click', () => {
    exportDiagram(graphComponent, 'png')
  })

  document.getElementById('btn-export-pdf')!.addEventListener('click', () => {
    exportDiagram(graphComponent, 'pdf')
  })

  document.getElementById('btn-print')!.addEventListener('click', () => {
    const printingSupport = new PrintingSupport()
    printingSupport.printGraph(graphComponent.graph)
  })
}

function initializeFileUpload(graphComponent: GraphComponent) {
  document.getElementById('btn-load-graph')!.addEventListener('click', () => {
    const nodesFile = (document.getElementById('nodes-file-input') as HTMLInputElement).files?.[0]
    const edgesFile = (document.getElementById('edges-file-input') as HTMLInputElement).files?.[0]

    if (nodesFile && edgesFile) {
      loadGraphFromFiles(graphComponent, nodesFile, edgesFile)
    } else {
      alert('Please select both nodes and edges files.')
    }
  })
}

function loadGraphFromFiles(graphComponent: GraphComponent, nodesFile: File, edgesFile: File) {
  const reader1 = new FileReader()
  reader1.onload = function (e) {
    const nodesCSV = e.target?.result as string
    const nodesData = parse(nodesCSV, { header: true }).data as any[]

    const reader2 = new FileReader()
    reader2.onload = function (e) {
      const edgesCSV = e.target?.result as string
      const edgesData = parse(edgesCSV, { header: true }).data as any[]

      updateGraph(graphComponent, nodesData, edgesData)
    }
    reader2.readAsText(edgesFile)
  }
  reader1.readAsText(nodesFile)
}

function updateGraph(graphComponent: GraphComponent, nodesData: any[], edgesData: any[]) {
  const graph = graphComponent.graph
  graph.clear()

  const typeColorMap: { [key: string]: string } = {}
  let colorIndex = 0
  const colors = ['#ff6f61', '#6b5b95', '#88b04b', '#f7cac9', '#92a8d1', '#955251', '#b565a7', '#009b77', '#dd4124', '#d65076']

  const uniqueNodes = new Map<string, any>()

  nodesData.forEach(node => {
    if (!uniqueNodes.has(node.id)) {
      uniqueNodes.set(node.id, node)
    }
  })

  uniqueNodes.forEach(node => {
    if (!typeColorMap[node.type]) {
      typeColorMap[node.type] = colors[colorIndex % colors.length]
      colorIndex++
    }
    const style = new ShapeNodeStyle({ fill: new SolidColorFill(typeColorMap[node.type]), shape: 'ellipse' })
    const nodeElement = graph.createNodeAt({
      location: [Math.random() * 500, Math.random() * 500],
      tag: node,
      style
    })
    graph.addLabel(nodeElement, node.label || "No Label", ExteriorLabelModel.SOUTH) // Move labels outside
  })

  const consolidatedEdges = new Map<string, { source: string, target: string, count: number, edgeType: string }>()

  edgesData.forEach(edge => {
    const edgeKey = `${edge.source}-${edge.target}`
    if (consolidatedEdges.has(edgeKey)) {
      consolidatedEdges.get(edgeKey)!.count += 1
    } else {
      consolidatedEdges.set(edgeKey, { source: edge.source, target: edge.target, count: 1, edgeType: edge.edgeType })
    }
  })

  consolidatedEdges.forEach(edge => {
    const sourceNode = graph.nodes.find(node => node.tag.id === edge.source)
    const targetNode = graph.nodes.find(node => node.tag.id === edge.target)

    if (sourceNode && targetNode) {
      const edgeStyle = new PolylineEdgeStyle({
        stroke: `2px solid ${colors[Math.floor(Math.random() * colors.length)]}`
      })
      const edgeElement = graph.createEdge({
        source: sourceNode,
        target: targetNode,
        tag: edge,
        style: edgeStyle
      })
      graph.addLabel(edgeElement, edge.edgeType || "No Type") // Ensure there is always an edge label
    }
  })

  graphComponent.fitGraphBounds()
  createLegend(graphComponent)
}

function initializeEdgeLabelToggle(graphComponent: GraphComponent) {
  let edgeLabelsVisible = true
  document.getElementById('btn-toggle-edge-labels')!.addEventListener('click', () => {
    edgeLabelsVisible = !edgeLabelsVisible
    if (edgeLabelsVisible) {
      showEdgeLabels(graphComponent)
    } else {
      hideEdgeLabels(graphComponent)
    }
  })
}

function showEdgeLabels(graphComponent: GraphComponent) {
  graphComponent.graph.edges.forEach(edge => {
    if (edge.labels.size === 0 && edge.tag.edgeType) {
      graphComponent.graph.addLabel(edge, edge.tag.edgeType)
    }
  })
}

function hideEdgeLabels(graphComponent: GraphComponent) {
  const graph = graphComponent.graph
  const edges = graph.edges.toArray()
  edges.forEach(edge => {
    const labels = edge.labels.toArray()
    labels.forEach(label => {
      graph.remove(label)
    })
  })
}

function initializeLayoutOptions(graphComponent: GraphComponent) {
  document.getElementById('btn-apply-layout')!.addEventListener('click', async () => {
    const layoutOption = (document.getElementById('layout-options') as HTMLSelectElement).value
    let layout
    switch (layoutOption) {
      case 'hierarchic':
        layout = new HierarchicLayout()
        break
      case 'organic':
        layout = new OrganicLayout()
        break
      case 'orthogonal':
        layout = new OrthogonalLayout()
        break
      case 'circular':
        layout = new CircularLayout()
        break
      default:
        layout = new OrganicLayout()
        break
    }

    const layoutExecutor = new LayoutExecutor(graphComponent, layout)
    await layoutExecutor.start()

    applyEdgeRouting(graphComponent)
  })
}

function applyEdgeRouting(graphComponent: GraphComponent) {
  const graph = graphComponent.graph
  const edgeRouter = new EdgeRouter()
  edgeRouter.scope = 'route-all-edges'

  const layoutExecutor = new LayoutExecutor({
    graphComponent,
    layout: edgeRouter,
    duration: '1s',
    animateViewport: true
  })
  layoutExecutor.start().catch(error => {
    console.error('Edge routing failed: ' + error)
  })
}

function createLegend(graphComponent: GraphComponent) {
  // Remove any existing legend
  const existingLegend = document.getElementById('node-type-legend')
  if (existingLegend) {
    existingLegend.remove()
  }

  const legendContainer = document.createElement('div')
  legendContainer.id = 'node-type-legend'
  legendContainer.style.position = 'absolute'
  legendContainer.style.top = '50px'
  legendContainer.style.right = '10px'
  legendContainer.style.backgroundColor = 'white'
  legendContainer.style.border = '1px solid #ccc'
  legendContainer.style.padding = '10px'
  legendContainer.style.zIndex = '1000'

  const legendTitle = document.createElement('div')
  legendTitle.style.fontWeight = 'bold'
  legendTitle.style.marginBottom = '5px'
  legendTitle.textContent = 'Node Type Legend'
  legendContainer.appendChild(legendTitle)

  const typeColorMap: { [key: string]: string } = {}
  graphComponent.graph.nodes.forEach(node => {
    const nodeType = node.tag.type
    if (nodeType && !typeColorMap[nodeType]) {
      const nodeStyle = node.style as ShapeNodeStyle
      if (nodeStyle.fill instanceof SolidColorFill) {
        typeColorMap[nodeType] = nodeStyle.fill.color.toString()
      }
    }
  })

  for (const [type, color] of Object.entries(typeColorMap)) {
    const legendItem = document.createElement('div')
    legendItem.style.display = 'flex'
    legendItem.style.alignItems = 'center'
    legendItem.style.marginBottom = '5px'

    const colorBox = document.createElement('div')
    colorBox.style.width = '15px'
    colorBox.style.height = '15px'
    colorBox.style.backgroundColor = color
    colorBox.style.marginRight = '5px'
    legendItem.appendChild(colorBox)

    const typeLabel = document.createElement('div')
    typeLabel.textContent = type
    legendItem.appendChild(typeLabel)

    legendContainer.appendChild(legendItem)
  }

  document.body.appendChild(legendContainer)
}

run()
