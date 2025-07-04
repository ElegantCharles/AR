document.addEventListener('DOMContentLoaded', () => {
  const statTargets = document.getElementById('stat-targets');
  const statAssets  = document.getElementById('stat-assets');
  const statExps    = document.getElementById('stat-exps');
  const ctx         = document.getElementById('usage-chart').getContext('2d');

  Promise.all([
    fetch('/api/targets/?page_size=1').then(r => r.json()),
    fetch('/api/assets/?page_size=1').then(r => r.json()),
    fetch('/api/experiences/?page_size=1').then(r => r.json()),
    fetch('/api/metrics/weekly/').then(r => r.json())
  ]).then(([t,a,e,m]) => {
    statTargets.textContent = t.count;
    statAssets.textContent  = a.count;
    statExps.textContent    = e.count;

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: m.labels,
        datasets: [{ data: m.values, borderWidth: 2, tension: 0.3 }]
      },
      options: {
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } }
      }
    });
  }).catch(console.error);
});
