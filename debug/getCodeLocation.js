export function getCodeLocation(depth = 2) {
  const e = new Error();
  const stack = (e.stack || '').split('\n').map(s => s.trim()).filter(Boolean);

  // Stack trace line selection: account for first line being the error message
  // and for user-provided depth (1 == immediate caller)
  const targetIndex = Math.min(depth, Math.max(1, stack.length - 1));
  // prefer the line at index = depth (since stack[0] === 'Error') but fallback
  let callerLine = stack[targetIndex] || stack[stack.length - 1] || '';

  // Try various regex patterns to extract function, file, line, column
  const patterns = [
    /at (.*?) \((.*?):(\d+):(\d+)\)/, // at fn (file:line:col)
    /at (.*?):(\d+):(\d+)/, // at file:line:col
    /(.*?):(\d+):(\d+)$/ // fallback file:line:col at end
  ];

  let fn = null;
  let file = import.meta.url;
  let line = null;
  let col = null;

  for (const p of patterns) {
    const m = callerLine.match(p);
    if (m) {
      if (m.length === 5) {
        // at fn (file:line:col)
        fn = m[1] || null;
        file = m[2] || file;
        line = m[3];
        col = m[4];
      } else if (m.length === 4) {
        // at file:line:col or file:line:col at end
        if (p === patterns[1]) {
          file = m[1];
          line = m[2];
          col = m[3];
        } else {
          file = m[1];
          line = m[2];
          col = m[3];
        }
      }
      break;
    }
  }

  // If the selected frame did not include a function name, search earlier
  // (lower depth index) frames for the nearest frame that does include one.
  if (!fn) {
    for (let i = targetIndex - 1; i >= 1; i--) {
      const lineCandidate = stack[i] || '';
      const m = lineCandidate.match(patterns[0]); // pattern that includes function
      if (m && m[1]) {
        fn = m[1];
        break;
      }
    }
  }

  // Normalize file URL => path if it's a file:// URL
  if (typeof file === 'string' && file.startsWith('file://')) {
    try { file = new URL(file).pathname } catch (e) { /* keep original */ }
  }

  return {
    file,
    line: line ? Number(line) : null,
    column: col ? Number(col) : null,
    functionName: fn,
    stack: stack.join('\n'),
  };
}
