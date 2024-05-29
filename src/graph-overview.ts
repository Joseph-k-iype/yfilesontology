import './graph-overview.css'
import { GraphComponent, GraphOverviewComponent } from 'yfiles'

export function initializeGraphOverview(
  graphComponent: GraphComponent
): GraphOverviewComponent {
  return new GraphOverviewComponent('#graph-overview-component', graphComponent)
}
