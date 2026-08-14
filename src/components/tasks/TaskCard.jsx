import React from 'react';
import { dueMeta } from '../../lib/utils';

export function TaskCard({ task, onComplete, onEdit, onDelete, compact = false }) {
  const completed = task.status === 'completed';
  const due = dueMeta(task.due_date);
  const overdue = due?.kind === 'overdue';

  return (
    <article className={`group flex items-start gap-3 py-4 transition-opacity duration-200 ${completed ? 'opacity-55' : ''} ${overdue && !completed ? 'border-l-2 border-butter pl-3' : ''}`}>
      {!completed && onComplete && (
        <button
          type="button"
          onClick={() => onComplete(task.id)}
          aria-label={`Complete ${task.title}`}
          className="mt-1 h-4 w-4 shrink-0 rounded-full border border-teal transition hover:bg-soft-butter focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        />
      )}
      <div className="min-w-0 flex-1">
        <h3 className={`break-words text-sm font-medium text-ink ${completed ? 'line-through decoration-taupe/60' : ''}`}>{task.title}</h3>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-meta text-taupe">
          <span>{task.estimated_duration}m</span>
          <span>{task.priority}</span>
          {task.energy_required && <span>{task.energy_required} energy</span>}
          {task.category && <span>{task.category}</span>}
          {due && <span className={overdue ? 'text-teal' : ''}>{due.label}</span>}
        </div>
        {!compact && task.description && (
          <p className="mt-2 text-sm text-mist">{task.description}</p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        {onEdit && (
          <button type="button" onClick={() => onEdit(task)} className="min-h-11 px-2 text-sm text-mist hover:text-teal" aria-label={`Edit ${task.title}`}>
            Edit
          </button>
        )}
        {onDelete && (
          <button type="button" onClick={() => onDelete(task)} className="min-h-11 px-2 text-sm text-taupe hover:text-ink" aria-label={`Delete ${task.title}`}>
            Delete
          </button>
        )}
      </div>
    </article>
  );
}
