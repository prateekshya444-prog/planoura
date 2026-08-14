import React, { useState } from 'react';
import { PrimaryButton, SecondaryButton, ChoiceRow, FieldLabel, TextInput } from '../ui/Button';
import { Timeline, UnscheduledPanel } from '../timeline/Timeline';

export function PlanInputForm({ onSubmit, loading, submitLabel = 'Plan my day' }) {
  const [availableFrom, setAvailableFrom] = useState('09:00');
  const [availableUntil, setAvailableUntil] = useState('17:00');
  const [energy, setEnergy] = useState('medium');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(availableFrom, availableUntil, energy);
      }}
      className="space-y-8"
    >
      <div>
        <h3 className="font-serif text-xl font-medium">When are you available?</h3>
        <p className="mt-2 text-sm text-mist">Planora only uses the hours you actually have.</p>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="plan-from">From</FieldLabel>
            <TextInput id="plan-from" type="time" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} disabled={loading} />
          </div>
          <div>
            <FieldLabel htmlFor="plan-until">Until</FieldLabel>
            <TextInput id="plan-until" type="time" value={availableUntil} onChange={(e) => setAvailableUntil(e.target.value)} disabled={loading} />
          </div>
        </div>
      </div>
      <div>
        <h3 className="font-serif text-xl font-medium">How is your energy?</h3>
        <div className="mt-5">
          <ChoiceRow value={energy} onChange={setEnergy} options={['low', 'medium', 'high']} disabled={loading} />
        </div>
      </div>
      <PrimaryButton type="submit" disabled={loading} className="w-full sm:w-auto">
        {loading ? 'Arranging…' : submitLabel}
      </PrimaryButton>
    </form>
  );
}

export function PlanViewContent({ todayPlan, tasks, onComplete, onReplan, onToday }) {
  if (!todayPlan) {
    return (
      <div>
        <p className="text-body text-mist">There isn’t a plan for today yet.</p>
        <PrimaryButton onClick={onReplan} className="mt-6">Plan my day</PrimaryButton>
      </div>
    );
  }

  return (
    <div>
      <p className="max-w-lg text-body text-mist">
        Your day, arranged. Move through it one block at a time.
      </p>
      {todayPlan.reasoning && (
        <blockquote className="mt-6 border-l-2 border-butter pl-4 text-sm italic leading-relaxed text-mist">
          {todayPlan.reasoning}
        </blockquote>
      )}
      <div className="mt-8">
        <Timeline plan={todayPlan} tasks={tasks} onComplete={onComplete} highlightNow />
      </div>
      <UnscheduledPanel items={todayPlan.unscheduled_tasks} />
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <PrimaryButton onClick={onReplan}>Replan</PrimaryButton>
        <SecondaryButton onClick={onToday}>Back to Today</SecondaryButton>
      </div>
    </div>
  );
}
