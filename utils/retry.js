function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function retryAsync(task, options = {}) {
  const {
    attempts = 3,
    delayMs = 250,
    shouldRetry = () => false,
    onRetry = () => {}
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < attempts && shouldRetry(error, attempt);

      if (!canRetry) {
        throw error;
      }

      onRetry(error, attempt, attempt + 1);
      await sleep(delayMs * attempt);
    }
  }

  throw lastError;
}
