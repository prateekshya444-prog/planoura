import React from 'react';
import { formatDuration } from '../../lib/utils';
import { blockDuration, isBlockDone, focusFromBlocks } from '../../lib/planUtils';
import { PrimaryButton } from '../ui/Button';

export function FocusStrip({ focus, taskById, onComplete }) {
  if (!focus?.block) return null;
  const block = focus.block;
  if (isBlockDone(block, taskById)) return null;
  const start = block.start_time || block.start;
  const end = block.end_time || block.end;
  const duration = blockDuration(block);
  const isTask = block.type === 'task';

  return (
    <section className="surface-accent p-5 md:p-6" aria-label={focus.kind === 'now' ? 'Current focus' : 'Up next'}>
      <p className="text-eyebrow text-teal">{focus.kind === 'now' ? 'Current' : 'Next up'}</p>
      <h2 className="mt-2 break-words font-serif text-2xl text-ink">{block.title}</h2>
      <p className="mt-2 text-sm tabular-nums text-mist">{start} – {end} · {formatDuration(duration)}</p>
      {isTask && block.task_id && onComplete && (
        <PrimaryButton onClick={() => onComplete(block.task_id)} className="mt-5">
          Mark done
        </PrimaryButton>
      )}
    </section>
  );
}

function TimelineBlock({ block, index, total, focus, taskById, onComplete }) {
  const isTask = block.type === 'task';
  const isBreak = block.type === 'break';
  const isBuffer = block.type === 'buffer';
  const linked = block.task_id ? taskById[String(block.task_id)] : null;
  const done = isBlockDone(block, taskById);
  const start = block.start_time || block.start;
  const end = block.end_time || block.end;
  const duration = blockDuration(block);
  const isNow = focus?.index === index && focus?.kind === 'now';
  const isNext = focus?.index === index && focus?.kind === 'next';
  const category = linked?.category || block.category || block.type;

  let statusClass = '';
  if (done) statusClass = 'timeline-done';
  else if (isNow) statusClass = 'timeline-now';
  else if (isNext) statusClass = 'timeline-next';
  else if (isBreak) statusClass = 'timeline-break';
  else if (isBuffer) statusClass = 'timeline-buffer';

  return (
    <div className={`timeline-row ${statusClass} ${index !== total - 1 ? 'border-b border-teal/10' : ''}`}>
      <div className="timeline-time">
        <div className="font-serif text-sm tabular-nums text-teal">{start}</div>
        <div className="mt-0.5 font-serif text-xs tabular-nums text-taupe">{end}</div>
      </div>
      <div className="timeline-rail" aria-hidden>
        <span className="timeline-dot" />
      </div>
      <div className="timeline-body">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              {(isNow || isNext) && !done && (
                <span className="text-meta text-teal">{isNow ? 'Now' : 'Next'}</span>
              )}
              <h3 className={`break-words text-[15px] text-ink ${done ? 'line-through decoration-teal-muted/70' : ''}`}>{block.title}</h3>
            </div>
            <p className="mt-2 text-meta text-taupe">
              {formatDuration(duration)}
              {category && <> · {category}</>}
              {isBreak && <> · break</>}
              {isBuffer && <> · buffer</>}
              {done && <> · kept</>}
            </p>
          </div>
          {isTask && block.task_id && onComplete && (
            <button
              type="button"
              onClick={() => onComplete(block.task_id)}
              disabled={done}
              className={done ? 'btn btn-ghost text-xs' : 'btn btn-primary text-xs px-3 py-2 min-h-10'}
            >
              {done ? 'Done' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Timeline({ plan, tasks = [], onComplete, highlightNow = false }) {
  const blocks = plan?.plan_blocks || [];
  const taskById = Object.fromEntries(tasks.map((t) => [String(t.id), t]));
  const focus = highlightNow ? focusFromBlocks(blocks) : { kind: null, index: null };

  if (!blocks.length) return null;

  return (
    <div className="min-w-0">
      {blocks.map((block, index) => (
        <TimelineBlock
          key={`${block.start || block.start_time}-${block.task_id || block.type}-${index}`}
          block={block}
          index={index}
          total={blocks.length}
          focus={focus}
          taskById={taskById}
          onComplete={onComplete}
        />
      ))}
    </div>
  );
}

export function UnscheduledPanel({ items = [] }) {
  if (!items.length) return null;
  const count = items.length;
  return (
    <section className="mt-8 border border-teal/10 bg-white/40 p-5 md:p-6" aria-label="Unscheduled tasks">
      <p className="text-eyebrow text-teal-muted">Didn’t fit today</p>
      <h3 className="mt-2 font-serif text-xl text-ink">
        {count} task{count === 1 ? '' : 's'} couldn’t fit today
      </h3>
      <p className="mt-2 text-sm text-mist">These weren’t forgotten — there simply wasn’t enough protected time.</p>
      <ul className="mt-5 divide-y divide-teal/10">
        {items.map((item) => (
          <li key={item.task_id} className="py-3.5">
            <div className="text-sm font-medium text-ink">{item.title}</div>
            <div className="mt-1 text-sm text-mist">{item.message}</div>
            {item.remaining_duration > 0 && item.required_duration > 0 && (
              <div className="mt-1 text-meta text-taupe">
                {item.scheduled_duration || 0} / {item.required_duration} min scheduled
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
