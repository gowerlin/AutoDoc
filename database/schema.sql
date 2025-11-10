-- AutoDoc Agent Database Schema
-- Version: 1.0.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    entry_url TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Project snapshots table (Task 11)
CREATE TABLE IF NOT EXISTS project_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    entry_url TEXT NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Metadata
    product_version VARCHAR(100),
    variant VARCHAR(100),
    environment VARCHAR(50),
    tags TEXT[],

    -- Exploration data
    total_pages INTEGER DEFAULT 0,
    explored_urls TEXT[],
    navigation_tree JSONB,
    page_snapshots JSONB,

    -- Manual content
    sections JSONB,
    screenshots JSONB,
    glossary JSONB,

    -- Statistics
    exploration_duration INTEGER, -- in seconds
    ai_questions_count INTEGER DEFAULT 0,
    human_interventions_count INTEGER DEFAULT 0,
    pages_with_errors TEXT[],

    -- Storage references
    storage_path TEXT,
    compressed BOOLEAN DEFAULT FALSE,
    file_size BIGINT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(project_id, version)
);

-- Version comparisons table (Task 11)
CREATE TABLE IF NOT EXISTS version_comparisons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    old_snapshot_id UUID NOT NULL REFERENCES project_snapshots(id) ON DELETE CASCADE,
    new_snapshot_id UUID NOT NULL REFERENCES project_snapshots(id) ON DELETE CASCADE,

    -- Comparison results
    structural_diff JSONB,
    visual_diff JSONB,
    semantic_diff JSONB,

    -- Change severity
    structural_change_rate FLOAT,
    visual_change_rate FLOAT,
    semantic_change_rate FLOAT,
    overall_severity VARCHAR(50), -- minimal, minor, moderate, major, breaking

    -- Strategy recommendation
    recommended_strategy VARCHAR(100), -- full_regeneration, incremental_with_new_chapters, screenshot_update_only, minor_text_update
    strategy_reason TEXT,
    estimated_time VARCHAR(50),
    estimated_cost VARCHAR(50),
    affected_chapters TEXT[],
    affected_screenshots TEXT[],

    -- Report
    report_url TEXT,
    report_format VARCHAR(20), -- markdown, pdf, html

    compared_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Exploration sessions table
CREATE TABLE IF NOT EXISTS exploration_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    snapshot_id UUID REFERENCES project_snapshots(id) ON DELETE SET NULL,

    status VARCHAR(50) NOT NULL, -- idle, ai_exploring, ai_questioning, human_demonstrating, human_questioning, paused, completed, failed
    current_url TEXT,
    current_page_title TEXT,

    -- Configuration
    strategy VARCHAR(50), -- bfs, dfs, importance_first
    max_depth INTEGER DEFAULT 3,
    max_pages INTEGER DEFAULT 100,
    screenshot_quality INTEGER DEFAULT 85,

    -- Progress
    pages_explored INTEGER DEFAULT 0,
    pages_pending INTEGER DEFAULT 0,
    exploration_queue JSONB,

    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Exploration events table (for tracking AI and human interactions)
CREATE TABLE IF NOT EXISTS exploration_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES exploration_sessions(id) ON DELETE CASCADE,

    event_type VARCHAR(50) NOT NULL, -- ai_question, human_answer, human_demonstration, human_question, ai_response, state_change, error
    event_data JSONB NOT NULL,

    url TEXT,
    screenshot_url TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Page snapshots table
CREATE TABLE IF NOT EXISTS pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES exploration_sessions(id) ON DELETE CASCADE,
    snapshot_id UUID REFERENCES project_snapshots(id) ON DELETE SET NULL,

    url TEXT NOT NULL,
    title VARCHAR(500),
    dom_hash VARCHAR(64),

    -- Screenshot
    screenshot_url TEXT,
    screenshot_hash VARCHAR(64),
    screenshot_captured_at TIMESTAMP WITH TIME ZONE,

    -- Elements
    interactive_elements JSONB,
    form_fields JSONB,
    navigation_elements JSONB,

    -- Network
    api_calls JSONB,

    -- Status
    explored BOOLEAN DEFAULT FALSE,
    has_errors BOOLEAN DEFAULT FALSE,
    error_message TEXT,

    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Manual sections table
CREATE TABLE IF NOT EXISTS manual_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    snapshot_id UUID REFERENCES project_snapshots(id) ON DELETE SET NULL,

    title VARCHAR(500) NOT NULL,
    content TEXT,
    section_type VARCHAR(50), -- feature, warning, note, step_by_step
    parent_section_id UUID REFERENCES manual_sections(id) ON DELETE CASCADE,
    order_index INTEGER,
    level INTEGER, -- h1, h2, h3, etc.

    -- Associated pages
    page_ids UUID[],
    screenshot_ids UUID[],

    -- Google Docs
    google_doc_id VARCHAR(255),
    google_doc_url TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Variants/Configurations table (Task 8)
CREATE TABLE IF NOT EXISTS variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    variant_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    base_url TEXT NOT NULL,

    -- Features
    features TEXT[],
    excluded_features TEXT[],
    custom_terminology JSONB,

    -- Configuration
    config JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(project_id, variant_id)
);

-- Shared content table (Task 8)
CREATE TABLE IF NOT EXISTS shared_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    content_type VARCHAR(50), -- section, screenshot, terminology
    title VARCHAR(500),
    content TEXT,
    content_data JSONB,

    -- Used by variants
    variant_ids UUID[],

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Credentials table (Task 9)
CREATE TABLE IF NOT EXISTS credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    credential_type VARCHAR(50) NOT NULL, -- form_login, cookie, oauth, api_token

    -- Encrypted data (AES-256)
    encrypted_data TEXT NOT NULL,
    encryption_iv VARCHAR(32) NOT NULL,

    -- Metadata
    description TEXT,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Terminology table (Task 4)
CREATE TABLE IF NOT EXISTS terminology (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    term VARCHAR(255) NOT NULL,
    definition TEXT,
    synonyms TEXT[],
    context TEXT,

    usage_count INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(project_id, term)
);

-- Indexes for performance
CREATE INDEX idx_snapshots_project_id ON project_snapshots(project_id);
CREATE INDEX idx_snapshots_version ON project_snapshots(version);
CREATE INDEX idx_snapshots_captured_at ON project_snapshots(captured_at);

CREATE INDEX idx_comparisons_project_id ON version_comparisons(project_id);
CREATE INDEX idx_comparisons_snapshots ON version_comparisons(old_snapshot_id, new_snapshot_id);

CREATE INDEX idx_sessions_project_id ON exploration_sessions(project_id);
CREATE INDEX idx_sessions_status ON exploration_sessions(status);
CREATE INDEX idx_sessions_started_at ON exploration_sessions(started_at);

CREATE INDEX idx_events_session_id ON exploration_events(session_id);
CREATE INDEX idx_events_type ON exploration_events(event_type);
CREATE INDEX idx_events_created_at ON exploration_events(created_at);

CREATE INDEX idx_pages_session_id ON pages(session_id);
CREATE INDEX idx_pages_url ON pages(url);
CREATE INDEX idx_pages_explored ON pages(explored);

CREATE INDEX idx_sections_project_id ON manual_sections(project_id);
CREATE INDEX idx_sections_parent ON manual_sections(parent_section_id);

CREATE INDEX idx_variants_project_id ON variants(project_id);
CREATE INDEX idx_credentials_project_id ON credentials(project_id);
CREATE INDEX idx_terminology_project_id ON terminology(project_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON exploration_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON manual_sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_variants_updated_at BEFORE UPDATE ON variants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shared_content_updated_at BEFORE UPDATE ON shared_content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_terminology_updated_at BEFORE UPDATE ON terminology
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
