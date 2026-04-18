function write(level, event, fields = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info(event, fields = {}) {
    write("info", event, fields);
  },
  warn(event, fields = {}) {
    write("warn", event, fields);
  },
  error(event, fields = {}) {
    write("error", event, fields);
  }
};
