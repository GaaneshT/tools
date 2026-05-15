<script lang="ts">
  import ToolFrame from '$lib/components/ToolFrame.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';

  type Mode = 'compound' | 'loan' | 'goal';
  let mode: Mode = $state('compound');

  // ───────── shared formatting ──────────────────────────────────────────
  const fmtMoney = (n: number) => {
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

  // ───────── Compound interest ──────────────────────────────────────────
  let compPrincipal = $state(10000);
  let compMonthly = $state(500);
  let compRate = $state(7);    // annual %
  let compYears = $state(20);
  let compCompound = $state(12); // times per year

  const compResult = $derived.by(() => {
    const r = compRate / 100;
    const n = clamp(compCompound, 1, 365);
    const t = compYears;
    const P = compPrincipal;
    const PMT = compMonthly;
    if (t < 0 || n < 1) return null;

    // FV with monthly contributions; treat contributions as monthly even when
    // compounding differs (most users intuit a monthly contribution).
    // Use compounding period rate = r/n. We'll iterate month-by-month for clarity.
    const months = Math.round(t * 12);
    const periodsPerMonth = n / 12;
    let balance = P;
    let contributions = 0;
    const series: { month: number; balance: number; contributions: number }[] = [];
    for (let m = 0; m < months; m++) {
      balance += PMT;
      contributions += PMT;
      // compound across "periodsPerMonth" — approximation when n != 12
      balance *= Math.pow(1 + r / n, periodsPerMonth);
      if (m % Math.max(1, Math.floor(months / 24)) === 0 || m === months - 1) {
        series.push({ month: m + 1, balance, contributions: P + contributions });
      }
    }
    const principalTotal = P + contributions;
    const interest = balance - principalTotal;
    return { final: balance, contributions, principalTotal, interest, series };
  });

  // ───────── Loan amortization ──────────────────────────────────────────
  let loanPrincipal = $state(500000);
  let loanRate = $state(3.5);
  let loanYears = $state(25);

  const loanResult = $derived.by(() => {
    const r = loanRate / 100 / 12;
    const n = loanYears * 12;
    if (loanPrincipal <= 0 || n <= 0) return null;
    const monthly = r === 0 ? loanPrincipal / n : loanPrincipal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const totalPaid = monthly * n;
    const totalInterest = totalPaid - loanPrincipal;

    // Yearly snapshot
    let balance = loanPrincipal;
    let cumInterest = 0;
    const series: { year: number; balance: number; cumInterest: number; cumPrincipal: number }[] = [];
    for (let m = 1; m <= n; m++) {
      const interest = balance * r;
      const principal = monthly - interest;
      balance -= principal;
      cumInterest += interest;
      if (m % 12 === 0 || m === n) {
        series.push({
          year: Math.ceil(m / 12),
          balance: Math.max(0, balance),
          cumInterest,
          cumPrincipal: loanPrincipal - Math.max(0, balance)
        });
      }
    }
    return { monthly, totalPaid, totalInterest, series };
  });

  // ───────── Savings goal ───────────────────────────────────────────────
  let goalTarget = $state(100000);
  let goalCurrent = $state(5000);
  let goalMonthly = $state(800);
  let goalRate = $state(5);

  const goalResult = $derived.by(() => {
    const r = goalRate / 100 / 12;
    if (goalTarget <= goalCurrent) return { months: 0, years: 0, label: 'already there 🎯' };
    if (goalMonthly <= 0 && r === 0) return null;
    let balance = goalCurrent;
    let months = 0;
    while (balance < goalTarget && months < 12 * 200) {
      balance = balance * (1 + r) + goalMonthly;
      months++;
    }
    if (months >= 12 * 200) return null;
    return { months, years: months / 12, label: `${Math.floor(months / 12)}y ${months % 12}m` };
  });

  // ───────── Sparkline helper ───────────────────────────────────────────
  function sparkline(values: number[], width = 600, height = 120): string {
    if (values.length === 0) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = width / (values.length - 1 || 1);
    return values
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
      .join(' ');
  }
</script>

<svelte:head>
  <title>Finance Calculator · tools.gaanesh.com</title>
  <meta name="description" content="Compound interest, loan amortization, and savings-goal calculators — runs entirely in your browser." />
</svelte:head>

<ToolFrame toolId="finance" command={`calc --mode ${mode}`}>
  {#snippet note()}
    Three modes: compound interest with contributions, loan amortization, and time-to-savings-goal.
  {/snippet}

  <!-- Mode tabs -->
  <div class="mb-5 inline-flex rounded-full border border-ghost-200/70 bg-ghost-50 p-1 font-mono text-xs dark:border-ink-600/60 dark:bg-ink-900/60">
    {#each [{ id: 'compound', label: 'compound interest' }, { id: 'loan', label: 'loan' }, { id: 'goal', label: 'savings goal' }] as t}
      <button
        type="button"
        onclick={() => (mode = t.id as Mode)}
        class="rounded-full px-4 py-1.5 transition {mode === t.id ? 'bg-ink-900 text-neon-cyan dark:bg-ink-700' : 'text-ghost-500 hover:text-ink-900 dark:hover:text-white'}"
      >{t.label}</button>
    {/each}
  </div>

  {#if mode === 'compound'}
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <!-- Inputs -->
      <div class="space-y-3">
        <label class="block">
          <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">starting amount</span>
          <input type="number" bind:value={compPrincipal} min="0" class="mt-1 w-full rounded-xl border border-ghost-200/70 bg-white/95 px-3 py-2 font-mono text-sm text-ink-900 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100" />
        </label>
        <label class="block">
          <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">monthly contribution</span>
          <input type="number" bind:value={compMonthly} min="0" class="mt-1 w-full rounded-xl border border-ghost-200/70 bg-white/95 px-3 py-2 font-mono text-sm text-ink-900 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100" />
        </label>
        <label class="block">
          <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">annual rate (%)</span>
          <input type="number" bind:value={compRate} step="0.1" class="mt-1 w-full rounded-xl border border-ghost-200/70 bg-white/95 px-3 py-2 font-mono text-sm text-ink-900 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100" />
        </label>
        <label class="block">
          <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">years</span>
          <input type="number" bind:value={compYears} min="0" max="100" class="mt-1 w-full rounded-xl border border-ghost-200/70 bg-white/95 px-3 py-2 font-mono text-sm text-ink-900 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100" />
        </label>
        <label class="block">
          <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">compounded per year</span>
          <select bind:value={compCompound} class="mt-1 w-full rounded-xl border border-ghost-200/70 bg-white/95 px-3 py-2 font-mono text-sm text-ink-900 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100">
            <option value={1}>Annually</option>
            <option value={2}>Semi-annually</option>
            <option value={4}>Quarterly</option>
            <option value={12}>Monthly</option>
            <option value={365}>Daily</option>
          </select>
        </label>
      </div>

      <!-- Output -->
      {#if compResult}
        <div class="space-y-4">
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-xl border border-neon-green/30 bg-neon-green/5 p-3">
              <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-neon-green">final balance</p>
              <p class="mt-1 text-2xl font-bold text-ink-900 dark:text-white">{fmtMoney(compResult.final)}</p>
            </div>
            <div class="rounded-xl border border-ghost-200/60 bg-white/95 p-3 dark:border-ink-600/60 dark:bg-ink-800/60">
              <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-ghost-500">contributions</p>
              <p class="mt-1 text-xl font-semibold text-ink-900 dark:text-white">{fmtMoney(compResult.principalTotal)}</p>
            </div>
            <div class="rounded-xl border border-neon-cyan/30 bg-neon-cyan/5 p-3">
              <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-neon-cyan">interest earned</p>
              <p class="mt-1 text-xl font-semibold text-neon-cyan">{fmtMoney(compResult.interest)}</p>
            </div>
          </div>

          <!-- Sparkline -->
          <div class="rounded-2xl border border-ghost-200/60 bg-ghost-50/60 p-4 dark:border-ink-600/60 dark:bg-ink-950/60">
            <p class="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ghost-500">growth over {compYears} years</p>
            <svg viewBox="0 0 600 140" class="h-32 w-full" preserveAspectRatio="none">
              <path d={sparkline(compResult.series.map((s) => s.contributions), 600, 120)} stroke="var(--color-ghost-400)" stroke-width="1.5" fill="none" />
              <path d={sparkline(compResult.series.map((s) => s.balance), 600, 120)} stroke="var(--color-neon-cyan)" stroke-width="2" fill="none" />
              <text x="4" y="14" font-family="JetBrains Mono" font-size="10" fill="currentColor" class="text-ghost-500">balance</text>
              <text x="4" y="28" font-family="JetBrains Mono" font-size="10" fill="currentColor" class="text-ghost-400">contributions</text>
            </svg>
          </div>

          <div class="flex justify-end">
            <CopyButton value={`Final: ${fmtMoney(compResult.final)} · Contributions: ${fmtMoney(compResult.principalTotal)} · Interest: ${fmtMoney(compResult.interest)}`} />
          </div>
        </div>
      {/if}
    </div>

  {:else if mode === 'loan'}
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div class="space-y-3">
        <label class="block">
          <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">loan amount</span>
          <input type="number" bind:value={loanPrincipal} min="0" class="mt-1 w-full rounded-xl border border-ghost-200/70 bg-white/95 px-3 py-2 font-mono text-sm text-ink-900 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100" />
        </label>
        <label class="block">
          <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">annual rate (%)</span>
          <input type="number" bind:value={loanRate} step="0.1" class="mt-1 w-full rounded-xl border border-ghost-200/70 bg-white/95 px-3 py-2 font-mono text-sm text-ink-900 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100" />
        </label>
        <label class="block">
          <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">term (years)</span>
          <input type="number" bind:value={loanYears} min="1" max="100" class="mt-1 w-full rounded-xl border border-ghost-200/70 bg-white/95 px-3 py-2 font-mono text-sm text-ink-900 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100" />
        </label>
      </div>

      {#if loanResult}
        <div class="space-y-4">
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-xl border border-neon-green/30 bg-neon-green/5 p-3">
              <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-neon-green">monthly payment</p>
              <p class="mt-1 text-2xl font-bold text-ink-900 dark:text-white">{fmtMoney(loanResult.monthly)}</p>
            </div>
            <div class="rounded-xl border border-ghost-200/60 bg-white/95 p-3 dark:border-ink-600/60 dark:bg-ink-800/60">
              <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-ghost-500">total paid</p>
              <p class="mt-1 text-xl font-semibold text-ink-900 dark:text-white">{fmtMoney(loanResult.totalPaid)}</p>
            </div>
            <div class="rounded-xl border border-neon-rose/30 bg-neon-rose/5 p-3">
              <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-neon-rose">total interest</p>
              <p class="mt-1 text-xl font-semibold text-neon-rose">{fmtMoney(loanResult.totalInterest)}</p>
            </div>
          </div>

          <div class="rounded-2xl border border-ghost-200/60 bg-ghost-50/60 p-4 dark:border-ink-600/60 dark:bg-ink-950/60">
            <p class="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ghost-500">balance over {loanYears} years</p>
            <svg viewBox="0 0 600 140" class="h-32 w-full" preserveAspectRatio="none">
              <path d={sparkline(loanResult.series.map((s) => s.balance), 600, 120)} stroke="var(--color-neon-cyan)" stroke-width="2" fill="none" />
              <path d={sparkline(loanResult.series.map((s) => s.cumInterest), 600, 120)} stroke="var(--color-neon-rose)" stroke-width="1.5" fill="none" />
              <text x="4" y="14" font-family="JetBrains Mono" font-size="10" fill="currentColor" class="text-ghost-500">balance</text>
              <text x="4" y="28" font-family="JetBrains Mono" font-size="10" fill="currentColor" class="text-ghost-400">interest paid</text>
            </svg>
          </div>

          <div class="overflow-x-auto rounded-2xl border border-ghost-200/60 bg-white/95 dark:border-ink-600/60 dark:bg-ink-800/60">
            <table class="w-full font-mono text-xs">
              <thead class="bg-ghost-50/70 text-left text-[10px] uppercase tracking-wide text-ghost-500 dark:bg-ink-900/60">
                <tr>
                  <th class="px-3 py-2">year</th>
                  <th class="px-3 py-2">balance</th>
                  <th class="px-3 py-2">cum. principal</th>
                  <th class="px-3 py-2">cum. interest</th>
                </tr>
              </thead>
              <tbody>
                {#each loanResult.series as row}
                  <tr class="border-t border-ghost-200/40 dark:border-ink-600/40">
                    <td class="px-3 py-1.5 text-neon-cyan">{row.year}</td>
                    <td class="px-3 py-1.5">{fmtMoney(row.balance)}</td>
                    <td class="px-3 py-1.5">{fmtMoney(row.cumPrincipal)}</td>
                    <td class="px-3 py-1.5 text-neon-rose">{fmtMoney(row.cumInterest)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    </div>

  {:else}
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div class="space-y-3">
        <label class="block">
          <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">target amount</span>
          <input type="number" bind:value={goalTarget} min="0" class="mt-1 w-full rounded-xl border border-ghost-200/70 bg-white/95 px-3 py-2 font-mono text-sm text-ink-900 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100" />
        </label>
        <label class="block">
          <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">current savings</span>
          <input type="number" bind:value={goalCurrent} min="0" class="mt-1 w-full rounded-xl border border-ghost-200/70 bg-white/95 px-3 py-2 font-mono text-sm text-ink-900 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100" />
        </label>
        <label class="block">
          <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">monthly contribution</span>
          <input type="number" bind:value={goalMonthly} min="0" class="mt-1 w-full rounded-xl border border-ghost-200/70 bg-white/95 px-3 py-2 font-mono text-sm text-ink-900 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100" />
        </label>
        <label class="block">
          <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">annual rate (%)</span>
          <input type="number" bind:value={goalRate} step="0.1" class="mt-1 w-full rounded-xl border border-ghost-200/70 bg-white/95 px-3 py-2 font-mono text-sm text-ink-900 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100" />
        </label>
      </div>

      <div class="space-y-4">
        {#if goalResult === null}
          <div class="rounded-xl border border-neon-rose/30 bg-neon-rose/5 p-4 font-mono text-sm text-neon-rose">
            Not reachable with the current contributions in 200 years. Increase the monthly amount or the rate.
          </div>
        {:else}
          <div class="rounded-2xl border border-neon-green/30 bg-neon-green/5 p-5 text-center">
            <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-neon-green">time to reach {fmtMoney(goalTarget)}</p>
            <p class="mt-2 text-4xl font-bold text-ink-900 dark:text-white">{goalResult.label}</p>
            {#if goalResult.months > 0}
              <p class="mt-2 font-mono text-xs text-ghost-500">{goalResult.months} months · ≈ {(goalResult.years).toFixed(1)} years</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <p class="mt-5 font-mono text-[10px] text-ghost-500">
    // not financial advice. assumes constant contributions and a constant rate.
  </p>
</ToolFrame>
