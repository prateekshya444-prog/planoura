export const parseClockMinutes = (value) => {
  if (!value) return null;
  const match = String(value).trim().match(/^([01]?\d|2[0-3]):([0-5]\d)/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

export const nowClockMinutes = () => {
  const date = new Date();
  return date.getHours() * 60 + date.getMinutes();
};

export const blockDuration = (block) => {
  if (Number(block?.duration_minutes) > 0) return Number(block.duration_minutes);
  const start = parseClockMinutes(block?.start_time || block?.start);
  const end = parseClockMinutes(block?.end_time || block?.end);
  if (start == null || end == null || end <= start) return 0;
  return end - start;
};

export const isBlockDone = (block, taskById = {}) => {
  if (block?.completed) return true;
  const linked = block?.task_id ? taskById[String(block.task_id)] : null;
  return Boolean(linked && linked.status === 'completed');
};

export const focusFromBlocks = (blocks = []) => {
  const now = nowClockMinutes();
  const timed = blocks.map((block, index) => ({
    block,
    index,
    start: parseClockMinutes(block.start_time || block.start),
    end: parseClockMinutes(block.end_time || block.end)
  })).filter((item) => item.start != null && item.end != null);

  const current = timed.find((item) => now >= item.start && now < item.end);
  if (current) return { kind: 'now', index: current.index, block: current.block };
  const upcoming = timed.filter((item) => item.start > now).sort((a, b) => a.start - b.start)[0];
  if (upcoming) return { kind: 'next', index: upcoming.index, block: upcoming.block };
  return { kind: null, index: null, block: null };
};

export const remainingMinutesInBlock = (block) => {
  const end = parseClockMinutes(block?.end_time || block?.end);
  if (end == null) return 0;
  return Math.max(0, end - nowClockMinutes());
};
