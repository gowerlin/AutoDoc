// Core type definitions for AutoDoc Agent

export interface BrowserConfig {
  headless: boolean;
  viewport: {
    width: number;
    height: number;
  };
  timeout: number;
  slowMo?: number;
}

export interface MCPConfig {
  url: string;
  maxRetries: number;
  retryDelay: number;
  heartbeatInterval: number;
}

export interface InteractiveElement {
  selector: string;
  type: 'button' | 'link' | 'tab' | 'dropdown' | 'input' | 'checkbox' | 'radio' | 'textarea';
  text: string;
  attributes: Record<string, string>;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  importance: number;
  visible: boolean;
}

export interface FormField {
  selector: string;
  name: string;
  type: string;
  required: boolean;
  placeholder?: string;
  value?: string;
  validation?: string;
}

export interface NavigationNode {
  id: string;
  url: string;
  title: string;
  type: 'page' | 'section' | 'feature';
  children: NavigationNode[];
  parent?: string;
  depth: number;
}

export interface PageSnapshot {
  url: string;
  title: string;
  domHash: string;
  screenshot: {
    url: string;
    hash: string;
    capturedAt: Date;
  };
  interactiveElements: InteractiveElement[];
  formFields: FormField[];
  apiCalls: ApiCall[];
}

export interface ApiCall {
  url: string;
  method: string;
  status: number;
  headers: Record<string, string>;
  timestamp: Date;
}

export interface ExplorationState {
  currentUrl: string;
  exploredUrls: Set<string>;
  pendingUrls: string[];
  depth: number;
  maxDepth: number;
}

export type CollaborationState =
  | 'idle'
  | 'ai_exploring'
  | 'ai_questioning'
  | 'human_demonstrating'
  | 'human_questioning'
  | 'paused'
  | 'completed'
  | 'failed';

export interface AIQuestion {
  id: string;
  type: 'choice' | 'fill_in' | 'demonstration';
  question: string;
  context: {
    url: string;
    screenshot: string;
    elements: InteractiveElement[];
  };
  options?: string[];
  timeout: number;
}

export interface HumanAction {
  type: 'click' | 'input' | 'scroll' | 'hover' | 'select';
  selector: string;
  value?: string;
  coordinates?: { x: number; y: number };
  timestamp: Date;
}

export interface ManualSection {
  id: string;
  title: string;
  content: string;
  type: 'feature' | 'warning' | 'note' | 'step_by_step';
  level: number;
  order: number;
  screenshots: string[];
  relatedPages: string[];
}

export interface ProjectSnapshot {
  id: string;
  projectName: string;
  version: string;
  entryUrl: string;
  capturedAt: Date;
  metadata: {
    productVersion?: string;
    variant?: string;
    environment?: string;
    tags: string[];
  };
  explorationData: {
    totalPages: number;
    exploredUrls: string[];
    navigationTree: NavigationNode;
    pageSnapshots: PageSnapshot[];
  };
  manualContent: {
    sections: ManualSection[];
    screenshots: ScreenshotMetadata[];
    glossary: TerminologyEntry[];
  };
  statistics: {
    explorationDuration: number;
    aiQuestionsCount: number;
    humanInterventionsCount: number;
    pagesWithErrors: string[];
  };
}

export interface ScreenshotMetadata {
  id: string;
  url: string;
  pageUrl: string;
  caption: string;
  hash: string;
  size: number;
  capturedAt: Date;
}

export interface TerminologyEntry {
  term: string;
  definition: string;
  synonyms: string[];
  context: string;
  usageCount: number;
}

export interface StructuralDiff {
  addedPages: string[];
  removedPages: string[];
  modifiedPages: {
    url: string;
    changes: {
      addedElements: InteractiveElement[];
      removedElements: InteractiveElement[];
      modifiedElements: {
        element: InteractiveElement;
        changes: string[];
      }[];
    };
  }[];
}

export interface VisualDiff {
  url: string;
  similarityScore: number;
  diffImage: Buffer;
  changedRegions: {
    x: number;
    y: number;
    width: number;
    height: number;
    severity: 'minor' | 'major' | 'critical';
  }[];
}

export interface SemanticDiff {
  addedFeatures: Feature[];
  removedFeatures: Feature[];
  modifiedFeatures: {
    feature: Feature;
    changes: {
      type: 'text_changed' | 'workflow_changed' | 'ui_redesigned';
      description: string;
      impact: 'low' | 'medium' | 'high';
    }[];
  }[];
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  pages: string[];
  elements: InteractiveElement[];
}

export interface ChangeSeverity {
  structuralChangeRate: number;
  visualChangeRate: number;
  semanticChangeRate: number;
  overallSeverity: 'minimal' | 'minor' | 'moderate' | 'major' | 'breaking';
}

export interface UpdateStrategy {
  strategy: 'full_regeneration' | 'incremental_with_new_chapters' | 'screenshot_update_only' | 'minor_text_update';
  reason: string;
  estimatedTime: string;
  estimatedCost: string;
  affectedChapters?: string[];
  affectedScreenshots?: string[];
}
