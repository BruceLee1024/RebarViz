'use client';

import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Sparkles, X } from 'lucide-react';

interface WorkbenchLayoutProps {
  title: string;
  summary: ReactNode;
  actions: ReactNode;
  inspector: ReactNode;
  viewer: ReactNode;
  analysisTabs: ReactNode;
  analysis: ReactNode;
  analysisOpen?: boolean;
  onAnalysisOpenChange?: (open: boolean) => void;
  assistant?: ReactNode;
  onAssistantToggle: () => void;
}

const mobileQuery = '(max-width: 767px)';
function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const getMobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const getServerMobileSnapshot = () => false;

export function WorkbenchTabs<T extends string>({ tabs, active, onChange, badges }: {
  tabs: readonly { key: T; label: string }[]; active: T; onChange: (key: T) => void;
  badges?: Partial<Record<T, ReactNode>>;
}) {
  return tabs.map(tab => <button key={tab.key} role="tab" aria-selected={active === tab.key}
    className={`rv-analysis-tab ${active === tab.key ? 'is-active' : ''}`}
    onClick={() => onChange(tab.key)}>{tab.label}{badges?.[tab.key]}</button>);
}

/** Viewport-sized workbench; each long panel owns its scrolling. */
export function WorkbenchLayout({ title, summary, actions, inspector, viewer, analysisTabs, analysis,
  analysisOpen: controlledOpen, onAnalysisOpenChange, assistant, onAssistantToggle }: WorkbenchLayoutProps) {
  const id = useId();
  const [localOpen, setLocalOpen] = useState(true);
  const analysisOpen = controlledOpen ?? localOpen;
  const setAnalysisOpen = onAnalysisOpenChange ?? setLocalOpen;
  const isMobile = useSyncExternalStore(subscribeMobile, getMobileSnapshot, getServerMobileSnapshot);
  const [inspectorPreference, setInspectorOpen] = useState<boolean | null>(null);
  const inspectorOpen = inspectorPreference ?? !isMobile;
  const [analysisExpanded, setAnalysisExpanded] = useState(false);

  return (
    <div className={`rv-workbench ${inspectorOpen ? '' : 'inspector-closed'} ${assistant ? 'assistant-open' : ''}`}>
      <div className="rv-workbench-heading">
        <div className="rv-heading-copy"><h1>{title}</h1><div className="rv-beam-summary">{summary}</div></div>
        <div className="rv-workbench-actions">
          <button className={`rv-button rv-inspector-toggle ${inspectorOpen ? 'is-active' : ''}`} onClick={() => setInspectorOpen(!inspectorOpen)}
            aria-expanded={inspectorOpen} aria-controls={`${id}-inspector`} aria-label={inspectorOpen ? '收起参数面板' : '展开参数面板'}>
            {inspectorOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}<span>参数</span>
          </button>
          {actions}
          <button className={`rv-button rv-ai-toggle ${assistant ? 'is-active' : ''}`} onClick={onAssistantToggle} aria-expanded={!!assistant} aria-label="AI 助手" title="AI 助手">
            <Sparkles size={15} /><span>AI 助手</span>
          </button>
        </div>
      </div>
      <div className="rv-workbench-body">
        {isMobile && inspectorOpen && <button className="rv-panel-backdrop" aria-label="关闭参数面板遮罩" onClick={() => setInspectorOpen(false)} />}
        <aside id={`${id}-inspector`} className="rv-inspector" aria-label={`${title}参数输入`} hidden={!inspectorOpen}
          onKeyDown={event => { if (event.key === 'Escape') setInspectorOpen(false); }}>
          <div className="rv-panel-title"><span><SlidersHorizontal size={16} />参数输入</span>
            <button className="rv-icon-button" aria-label="关闭参数面板" onClick={() => setInspectorOpen(false)}><PanelLeftClose size={16} /></button>
          </div>
          <div className="rv-inspector-scroll scrollbar-thin">{inspector}</div>
        </aside>
        <section className={`rv-model-workspace ${analysisExpanded && analysisOpen ? 'analysis-expanded' : ''}`} aria-label="模型与分析">
          <div className="rv-model-stage">{viewer}</div>
          <section className={`rv-analysis-dock ${analysisOpen ? '' : 'is-collapsed'}`} aria-label="配筋分析">
            <div className="rv-analysis-heading">
              <div className="rv-analysis-tabs" role="tablist" aria-label="配筋分析类型" onClick={() => setAnalysisOpen(true)}
                onKeyDown={event => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
                  const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
                    : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                  event.preventDefault(); tabs[next]?.focus(); tabs[next]?.click();
                }}>{analysisTabs}</div>
              <div className="rv-analysis-actions">
                {analysisOpen && <button className="rv-icon-button" onClick={() => setAnalysisExpanded(v => !v)} aria-label={analysisExpanded ? '还原分析面板' : '放大分析面板'}>
                  {analysisExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>}
                <button className="rv-icon-button" onClick={() => setAnalysisOpen(!analysisOpen)} aria-expanded={analysisOpen} aria-controls={`${id}-analysis`}
                  aria-label={analysisOpen ? '收起分析面板' : '展开分析面板'}>{analysisOpen ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button>
              </div>
            </div>
            <div id={`${id}-analysis`} className="rv-analysis-content scrollbar-thin" hidden={!analysisOpen} role="tabpanel" aria-label="当前配筋分析">{analysis}</div>
          </section>
        </section>
        {assistant && <aside className="rv-assistant-drawer" aria-label="AI 配筋助手">
          <button className="rv-icon-button rv-assistant-close" aria-label="关闭 AI 助手" onClick={onAssistantToggle}><X size={17} /></button>
          {assistant}
        </aside>}
      </div>
    </div>
  );
}
