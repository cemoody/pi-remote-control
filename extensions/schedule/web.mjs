export function renderActivity(props) {
  const React = props.React;
  const { useEffect, useState } = React;
  function SchedulePanel() {
    const [state, setState] = useState({ loading: true, error: null, jobs: [], filePath: '' });
    const refresh = () => {
      if (!props.api.cron) {
        setState({ loading: false, error: 'Schedule API is not available.', jobs: [], filePath: '' });
        return;
      }
      setState((current) => ({ ...current, loading: true, error: null }));
      props.api.cron.list()
        .then((result) => setState({ loading: false, error: null, jobs: result.jobs, filePath: result.filePath }))
        .catch((error) => setState({ loading: false, error: error instanceof Error ? error.message : String(error), jobs: [], filePath: '' }));
    };
    useEffect(() => { refresh(); }, []);
    return React.createElement('div', { className: 'cron-panel external-schedule-panel' },
      React.createElement('header', null,
        React.createElement('div', null,
          React.createElement('h2', null, 'Schedule'),
          React.createElement('p', null, state.filePath || 'Scheduled Pi prompts')
        ),
        React.createElement('button', { type: 'button', onClick: refresh, disabled: state.loading }, state.loading ? 'Loading…' : 'Refresh')
      ),
      state.error ? React.createElement('p', { role: 'alert', className: 'dialog-error' }, state.error) : null,
      state.jobs.length === 0 && !state.loading ? React.createElement('p', null, 'No scheduled jobs yet.') : null,
      state.jobs.length > 0 ? React.createElement('ul', { className: 'cron-job-list' }, state.jobs.map((job) => React.createElement('li', { key: job.id, className: 'cron-job-card' },
        React.createElement('div', null,
          React.createElement('strong', null, job.name),
          React.createElement('code', null, job.schedule),
          React.createElement('p', null, job.prompt)
        ),
        React.createElement('button', { type: 'button', onClick: () => props.api.cron.runNow(job.id).then(refresh) }, 'Run now')
      ))) : null
    );
  }
  return React.createElement(SchedulePanel);
}
