import React, { useEffect, useState } from 'react';
import { PrimaryButton, ChoiceRow, FieldLabel, TextInput, SelectInput } from '../ui/Button';

const emptyTask = {
  title: '',
  estimated_duration: '60',
  priority: 'medium',
  energy_required: 'medium',
  category: 'study',
  due_date: ''
};

export function TaskForm({ initialTask = null, onSubmit, loading, submitLabel = 'Save task' }) {
  const [form, setForm] = useState(emptyTask);

  useEffect(() => {
    if (initialTask) {
      setForm({
        title: initialTask.title || '',
        estimated_duration: String(initialTask.estimated_duration || 60),
        priority: initialTask.priority || 'medium',
        energy_required: initialTask.energy_required || 'medium',
        category: initialTask.category || 'study',
        due_date: initialTask.due_date ? String(initialTask.due_date).slice(0, 10) : ''
      });
    } else {
      setForm(emptyTask);
    }
  }, [initialTask]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      title: form.title,
      estimated_duration: parseInt(form.estimated_duration, 10),
      priority: form.priority,
      energy_required: form.energy_required,
      category: form.category,
      due_date: form.due_date || null
    });
  };

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <FieldLabel htmlFor="task-title">Task</FieldLabel>
        <TextInput id="task-title" value={form.title} onChange={set('title')} placeholder="e.g., Biology Chapter 4" disabled={loading} required />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="task-duration">Duration (min)</FieldLabel>
          <TextInput id="task-duration" type="number" min="5" value={form.estimated_duration} onChange={set('estimated_duration')} disabled={loading} required />
        </div>
        <div>
          <FieldLabel htmlFor="task-due">Due date</FieldLabel>
          <TextInput id="task-due" type="date" value={form.due_date} onChange={set('due_date')} disabled={loading} />
        </div>
      </div>
      <div>
        <p className="planora-label">Priority</p>
        <ChoiceRow value={form.priority} onChange={(v) => setForm((p) => ({ ...p, priority: v }))} options={['low', 'medium', 'high']} disabled={loading} />
      </div>
      <div>
        <p className="planora-label">Energy required</p>
        <ChoiceRow value={form.energy_required} onChange={(v) => setForm((p) => ({ ...p, energy_required: v }))} options={['low', 'medium', 'high']} disabled={loading} />
      </div>
      <div>
        <FieldLabel htmlFor="task-category">Category</FieldLabel>
        <SelectInput id="task-category" value={form.category} onChange={set('category')} disabled={loading}>
          <option value="study">Study</option>
          <option value="work">Work</option>
          <option value="personal">Personal</option>
          <option value="health">Health</option>
          <option value="errands">Errands</option>
        </SelectInput>
      </div>
      <PrimaryButton type="submit" disabled={loading} className="w-full sm:w-auto">
        {loading ? 'Saving…' : submitLabel}
      </PrimaryButton>
    </form>
  );
}
