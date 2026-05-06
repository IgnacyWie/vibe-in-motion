async function executePrompt({ channel, from, prompt, chatId }) {
  const trimmedPrompt = String(prompt || '').trim()

  if (!trimmedPrompt) {
    return {
      ok: false,
      reply: 'No prompt received. Send a message describing what you want to do.'
    }
  }

  const executionId = createExecutionId()

  return {
    ok: true,
    executionId,
    reply: [
      `Closed loop acknowledged.`,
      `Channel: ${channel}`,
      `Sender: ${from}`,
      `Chat: ${chatId}`,
      `Prompt: ${trimmedPrompt}`,
      `Execution: ${executionId}`,
      'No code changes or deployment were triggered.'
    ].join('\n')
  }
}

function createExecutionId() {
  return `exec_${Date.now().toString(36)}`
}

module.exports = {
  executePrompt
}
