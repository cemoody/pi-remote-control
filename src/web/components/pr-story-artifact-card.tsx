import React, { useMemo, useState } from 'react';
import { coercePrStory, type PrStory, type PrStoryFrame } from '../../pr-story/pr-story.js';
import type { PrStoryDraftComment } from '../../pr-story/comments.js';
import './pr-story.css';

export function PrStoryArtifactCard(props: { storyInput: unknown; sessionId?: string; onSubmitComments?: (comments: PrStoryDraftComment[]) => Promise<void> | void }) {
  const parsed = useMemo((): { story?: PrStory; error?: string } => {
    try { return { story: coercePrStory(props.storyInput) }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [props.storyInput]);
  const [open, setOpen] = useState(false);
  if (parsed.error || !parsed.story) return <section className="pr-story-invalid" data-testid="artifact-pr-story" role="alert"><strong>Invalid PR Story</strong><pre>{parsed.error}</pre></section>;
  const story = parsed.story;
  const first = story.frames[0]!;
  const chapter = first.chapterId ? story.chapters.find((c) => c.id === first.chapterId) : undefined;
  return <section className="pr-story-artifact" data-testid="artifact-pr-story" aria-label={story.title}>
    <header className="pr-story-card-header">
      <div className="pr-story-card-kicker">PR Story</div>
      <div className="pr-story-card-main">
        <div className="pr-story-card-title">
          <strong>{story.title}</strong>
          <span>{story.pr.owner}/{story.pr.repo}#{story.pr.number} · {story.frames.length} frames{story.coverage ? ` · ${story.coverage.reviewedChangedLines}/${story.coverage.totalChangedLines} lines reviewed` : ''}</span>
        </div>
      </div>
      <div className="pr-story-card-meta">
        <span>{story.pr.title}</span>
      </div>
      <div className="pr-story-actions"><button className="pr-story-primary-action" type="button" onClick={() => setOpen(true)}>Open story</button></div>
    </header>
    <div className="pr-story-preview-grid">
      <div className="pr-story-preview-copy"><span>{chapter?.label ?? 'First frame'} · 1/{story.frames.length}</span><h3>{first.titleMd ?? first.file}</h3><p>{first.narrativeMd ?? story.narrative.rationale}</p></div>
      <div className="pr-story-preview-code"><div>{first.file}</div><pre>{renderDiff(first)}</pre></div>
    </div>
    {open ? <PrStoryReaderModal story={story} onClose={() => setOpen(false)} onSubmitComments={props.onSubmitComments ?? noopSubmitComments} /> : null}
  </section>;
}

export function PrStoryReaderModal(props: { story: PrStory; onClose: () => void; onSubmitComments?: (comments: PrStoryDraftComment[]) => Promise<void> | void }) {
  const { story } = props;
  const [index, setIndex] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [comments, setComments] = useState<PrStoryDraftComment[]>([]);
  const frame = story.frames[index]!;
  const chapter = frame.chapterId ? story.chapters.find((c) => c.id === frame.chapterId) : undefined;
  const next = () => setIndex((i) => Math.min(story.frames.length - 1, i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const saveDraft = () => {
    if (!draft.trim()) return;
    const firstLine = frame.rows.find((r) => r.kind === 'add' || r.kind === 'ctx' || r.kind === 'rem');
    const line = firstLine && firstLine.kind !== 'hunk' ? (firstLine.lnNew ?? firstLine.lnOld ?? undefined) : undefined;
    const side = firstLine && firstLine.kind === 'rem' ? 'LEFT' : 'RIGHT';
    setComments((cs) => [...cs, { id: `draft-${cs.length + 1}`, storyId: story.id, frameId: frame.id, file: frame.file, line, side, bodyMd: draft, selectedText: undefined, createdAt: new Date(0 + cs.length).toISOString(), kind: line == null ? 'chunk' : 'line' }]);
    setDraft('');
    setComposerOpen(false);
  };
  return <div className="pr-story-modal-backdrop">
    <div className="pr-story-modal" role="dialog" aria-label={`${story.title} PR Story`} data-testid="artifact-pr-story-modal" onKeyDown={(e) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') props.onClose();
      if (e.key === 'ArrowRight' || e.key === 'j' || e.key === ' ') next();
      if (e.key === 'ArrowLeft' || e.key === 'k') prev();
      if (e.key === 'c') setComposerOpen(true);
    }} tabIndex={-1}>
      <div className="pr-story-settings-topbar">
        <div className="pr-story-crumbs" aria-label="Breadcrumb"><span>{story.pr.owner}/{story.pr.repo}#{story.pr.number}</span>{chapter ? <span>{chapter.label}</span> : null}</div>
        <div className="pr-story-modal-nav"><button type="button" onClick={prev} aria-label="Previous frame">←</button><button className="pr-story-primary-action" type="button" onClick={next} aria-label="Next frame">→</button><button type="button" onClick={() => setComposerOpen(true)}>Comment</button><button type="button" aria-label="Close PR Story" onClick={props.onClose}>Close</button></div>
      </div>
      <main className="pr-story-reader">
        <nav className="pr-story-chapter-rail" aria-label="Chapter rail">{story.chapters.map((c) => <button className={c.id === chapter?.id ? 'active' : ''} key={c.id} type="button" onClick={() => setIndex(Math.max(0, story.frames.findIndex((f) => f.id === c.frameIds[0])))}>{c.label}</button>)}</nav>
        <section className="pr-story-content">
          <div className="pr-story-row">
            <aside className="pr-story-narrative-pane"><h2>{frame.titleMd}</h2><p>{frame.narrativeMd}</p></aside>
            <section className="pr-story-code-pane"><pre aria-label={`${frame.file} diff`}>{renderDiff(frame)}</pre></section>
          </div>
        </section>
      </main>
      {composerOpen ? <div className="pr-story-compose-card"><label>Comment<textarea aria-label="Comment" value={draft} onChange={(e) => setDraft(e.target.value)} /></label><div className="pr-story-compose-actions"><button onClick={saveDraft}>Save draft</button><button onClick={() => setComposerOpen(false)}>Cancel</button></div></div> : null}
      <section className="pr-story-drafts" aria-label="Draft comments">{comments.map((c) => <article key={c.id}><strong>{c.file}:{c.line}</strong><p>{c.bodyMd}</p></article>)}</section>
      <div className="pr-story-submit-row"><button className={comments.length > 0 ? 'pr-story-primary-action' : undefined} type="button" disabled={comments.length === 0} onClick={() => props.onSubmitComments?.(comments)}>Submit {comments.length} comment{comments.length === 1 ? '' : 's'} to session</button></div>
      <div className="pr-story-mobile-actions" aria-label="Story actions"><button type="button" onClick={prev} aria-label="Previous frame">←</button><button className="pr-story-primary-action" type="button" onClick={next} aria-label="Next frame">→</button><button type="button" onClick={() => setComposerOpen(true)}>Comment</button><button type="button" aria-label="Close PR Story" onClick={props.onClose}>Close</button></div>
    </div>
  </div>;
}

function noopSubmitComments(): void {}

function renderDiff(frame: PrStoryFrame): string {
  return frame.rows.map((row) => row.kind === 'hunk' ? row.text : `${row.kind === 'add' ? '+' : row.kind === 'rem' ? '-' : ' '}${row.tokens.map((t) => t.text).join('')}`).join('\n');
}
