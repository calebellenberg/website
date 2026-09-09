addEventListener("DOMContentLoaded", () => {
    function postMarkup(post) {
        return `
            <div class="header">
              <div class="avatar"></div>
              <div class="username">${post.username}</div>
              <div class="time">${post.time}</div>
            </div>
            <div class="content">${post.content}</div>
            <div class="actions">
              <div class="comments">
            <img src="images/comment.svg" alt="comments" class="icon" />
            <span>${post.comments}</span>
              </div>
              <div class="upvote">
            <img src="images/upvote.svg" alt="upvote" class="icon" />
            <span class="upvotes">${post.upvotes}</span>
            <img src="images/downvote.svg" alt="downvote" class="icon" />
              </div>
            </div>
          `;
    }

    const arrow = document.querySelector(".down-arrow");
    if (arrow) {
        arrow.addEventListener("click", (e) => {
            const target = document.querySelector(arrow.getAttribute("href"));

            if (!target ||
                matchMedia("(prefers-reduced-motion: reduce)").matches) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    const wrap = document.getElementById("daily-upvotes-wrap");
    const chart = document.getElementById("daily-upvotes-chart");
    const notesEl = document.getElementById("daily-notes");
    if (!wrap || !chart || !notesEl) return;

    const BAR_H = 6;
    const ROW = 9;
    const FOCUS = 0.18;
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const smooth = (t) => t * t * (3 - 2 * t);
    const fmt = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M`
        : n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n));

    fetch("data/upvotesByDay.csv")
        .then((r) => r.text())
        .then((text) => {
            const days = text.trim().split("\n").slice(1)
                .map((line) => line.split(","))
                .filter((p) => p.length >= 2)
                .map((p) => ({ date: p[0].trim(), value: Number(p[1]) }));
            if (!days.length) return;
            const values = days.map((d) => d.value).sort((a, b) => a - b);
            const OUTLIER_X = 14;
            const threshold = values[Math.floor(values.length / 2)] * OUTLIER_X;
            let baseMax = values[0];
            for (const v of values) { if (v > threshold) break; baseMax = v; }

            const outliers = days
                .map((d, i) => ({ row: i, value: d.value }))
                .filter((o) => o.value > baseMax);
            const zoomMax = values[values.length - 1];
            const track = document.createElement("div");
            track.id = "daily-track";
            const labels = document.createElement("div");
            labels.id = "daily-labels";
            chart.append(labels, track);
            const bars = days.map((d, i) => {
                const bar = document.createElement("div");
                bar.className = "daily-bar";
                bar.style.top = `${i * ROW}px`;
                bar.style.height = `${BAR_H}px`;
                bar.style.width = `max(2px, ${(d.value / baseMax) * 100}%)`;
                track.appendChild(bar);
                const [yy, mm] = d.date.split("-");
                const prev = i ? days[i - 1].date.split("-") : null;
                const newYear = !prev || yy !== prev[0];
                if (!prev || mm !== prev[1]) {
                    const label = document.createElement("div");
                    label.className = newYear ? "daily-year" : "daily-month";
                    label.style.top = `${i * ROW + BAR_H / 2}px`;
                    label.textContent = `${MONTHS[+mm - 1]} ’${yy.slice(2)}`;
                    labels.appendChild(label);
                    if (newYear && prev) {
                        const rule = document.createElement("div");
                        rule.className = "daily-yearline";
                        rule.style.top = `${i * ROW - 2}px`;
                        labels.appendChild(rule);
                    }
                }
                return bar;
            });
            track.style.height = `${days.length * ROW}px`;
            const axisEl = document.getElementById("daily-axis");
            let ticks = [], tickStep = 0, axisW = 0;

            function niceStep(v) {
                const raw = v / 6;
                const mag = Math.pow(10, Math.floor(Math.log10(raw)));
                const n = raw / mag;
                return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
            }

            function drawAxis(need) {
                const step = niceStep(need);
                if (step !== tickStep) {
                    ticks.forEach((t) => t.el.remove());
                    ticks = [];
                    for (let v = 0; v <= zoomMax; v += step) {
                        const el = document.createElement("div");
                        el.className = "wa-tick";
                        el.innerHTML = `<b>${fmt(v)}</b>`;
                        axisEl.appendChild(el);
                        ticks.push({ v, el, lw: el.firstChild.offsetWidth });
                    }
                    tickStep = step;
                }
                ticks.forEach((t) => {
                    const x = (t.v / need) * axisW;
                    t.el.style.transform = `translateX(${x}px)`;
                    t.el.style.opacity = x <= axisW + 1 ? "1" : "0";
                    t.el.classList.toggle("wa-mute", x + 5 + t.lw > axisW);
                });
            }

            notesEl.querySelectorAll(".sc-post").forEach((el) => {
                const d = el.dataset;
                const content = el.innerHTML.trim();
                el.className = "post";
                el.innerHTML = postMarkup({
                    username: d.user || "Brown",
                    time: d.time || "",
                    content,
                    comments: d.comments || 0,
                    upvotes: d.upvotes || 0
                });
            });
            const starts = days.map((d) => d.date);
            function rowFor(date) {
                let lo = 0, hi = starts.length - 1, best = -1;
                while (lo <= hi) {
                    const mid = (lo + hi) >> 1;
                    if (starts[mid] <= date) { best = mid; lo = mid + 1; } else hi = mid - 1;
                }
                return best;
            }

            const stops = [...notesEl.querySelectorAll(".day-note")]
                .map((el) => ({ el, row: rowFor(el.dataset.day) }))
                .filter((s) => {
                    if (s.row < 0) console.warn("day-note has no matching day:", s.el.dataset.day);
                    return s.row >= 0;
                })
                .sort((a, b) => a.row - b.row);

            let V = 0, H = 0, padTop = 0, axisH = 0, focus = 0, totalTrack = 0, flat = false;
            let wrapTop = 0;
            const reduced = matchMedia("(prefers-reduced-motion: reduce)");
            const stageEl = chart.parentElement;

            function layout() {
                flat = reduced.matches;
                wrap.classList.toggle("is-flat", flat);
                V = flat ? window.innerHeight
                    : (stageEl.clientHeight || window.innerHeight);

                focus = V * FOCUS;
                axisH = axisEl.querySelector(".wa-head").offsetHeight;
                padTop = Math.max(axisH + 14, focus - BAR_H / 2);
                const padBottom = flat ? 24 : V - focus;
                axisW = axisEl.clientWidth;
                H = padTop + days.length * ROW + padBottom;
                track.style.top = `${padTop}px`;
                labels.style.top = `${padTop}px`;
                chart.style.height = `${H}px`;

                const rowY = (i) => padTop + i * ROW;

                if (flat) {
                    wrap.style.height = "";
                    chart.style.transform = "";
                    track.style.transform = `scaleX(${baseMax / zoomMax})`;
                    if (axisEl.parentElement !== chart) chart.appendChild(axisEl);
                    drawAxis(zoomMax);
                    chart.parentElement.appendChild(notesEl);
                    stops.forEach((s) => { s.el.style.top = ""; s.el.style.transform = ""; });
                    return;
                }

                if (axisEl.parentElement === chart) chart.parentElement.appendChild(axisEl);
                stops.forEach((s) => {
                    s.el.style.top = "0px";
                    s.el.classList.remove("is-on");
                    bars[s.row].classList.remove("is-active");
                    s.f = clamp(rowY(s.row) + BAR_H / 2 - focus, 0, H - V);
                    s.P = V + s.el.offsetHeight;
                });

                const SNAP = 130;
                for (let i = 0; i < stops.length;) {
                    let j = i;
                    while (j + 1 < stops.length && stops[j + 1].f - stops[i].f < SNAP) j++;
                    if (j > i) {
                        const shared = (stops[i].f + stops[j].f) / 2;
                        for (let k = i; k <= j; k++) stops[k].f = shared;
                    }
                    i = j + 1;
                }

                wrapTop = wrap.getBoundingClientRect().top + window.scrollY;
                totalTrack = (H - V) + stops.reduce((a, s) => a + s.P, 0);
                wrap.style.height = `${totalTrack + V}px`;
            }

            function resolve(s) {
                let acc = 0, offset = 0;
                for (let k = 0; k < stops.length; k++) {
                    const seg = stops[k].f - offset;
                    if (s < acc + seg) return { offset: offset + (s - acc), active: -1, t: 0 };
                    acc += seg;
                    offset = stops[k].f;
                    if (s < acc + stops[k].P) {
                        return { offset, active: k, t: (s - acc) / stops[k].P };
                    }
                    acc += stops[k].P;
                }
                return { offset: offset + (s - acc), active: -1, t: 0 };
            }

            function weightAt(offset) {
                const BAND = V * 0.30;
                const MARGIN = V * 0.50;
                let w = 0;
                for (const o of outliers) {
                    const y = padTop + o.row * ROW + BAR_H / 2 - offset;
                    const d = 1 - (Math.abs(y - focus) - BAND) / MARGIN;
                    w = Math.max(w, smooth(clamp(d, 0, 1)));
                }
                return w;
            }

            let lastActive = -2, lastOffset = null, lastNeed = null;

            function update() {
                if (flat) return;
                const raw = window.scrollY - wrapTop;
                const s = clamp(raw, 0, totalTrack);
                const st = resolve(s);
                const active = raw < 0 ? -1 : st.active;
                const offset = clamp(st.offset, 0, H - V);

                if (offset !== lastOffset) {
                    lastOffset = offset;
                    chart.style.transform = `translate3d(0, ${-offset}px, 0)`;
                    const w = weightAt(offset);
                    const need = baseMax + (zoomMax - baseMax) * w;
                    if (need !== lastNeed) {
                        lastNeed = need;
                        track.style.transform = `scaleX(${baseMax / need})`;
                        drawAxis(need);
                    }
                }

                if (active !== lastActive) {
                    if (lastActive >= 0) {
                        bars[stops[lastActive].row].classList.remove("is-active");
                        stops[lastActive].el.classList.remove("is-on");
                    }
                    if (active >= 0) {
                        bars[stops[active].row].classList.add("is-active");
                        stops[active].el.classList.add("is-on");
                    }
                    chart.classList.toggle("has-active", active >= 0);
                    lastActive = active;
                }

                if (active >= 0) {
                    const stop = stops[active];
                    const y = Math.round(V - st.t * stop.P);
                    stop.el.style.transform = `translate3d(0, ${y}px, 0)`;
                }
            }

            const tip = document.createElement("div");
            tip.id = "daily-tip";
            document.body.appendChild(tip);
            let tipPending = false;
            stageEl.addEventListener("mousemove", (e) => {
                if (tipPending) return;
                tipPending = true;
                requestAnimationFrame(() => { tipPending = false; showTip(e); });
            });

            function showTip(e) {
                const top = chart.getBoundingClientRect().top;
                const row = Math.floor((e.clientY - top - padTop) / ROW);
                const day = days[row];

                if (!day || e.clientY < axisH || e.target.closest(".note-card, .post")) {
                    tip.classList.remove("is-on");
                    return;
                }

                const r = bars[row].getBoundingClientRect();
                if (e.clientX < r.left - 2 || e.clientX > r.right + 2) {
                    tip.classList.remove("is-on");
                    return;
                }

                tip.innerHTML = `${new Date(day.date + "T00:00").toLocaleDateString(undefined,
                    { month: "short", day: "numeric", year: "numeric" })}<br>` +
                    `<b>${day.value.toLocaleString()}</b> upvotes`;
                tip.classList.add("is-on");
                tip.style.left = `${Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8)}px`;
                tip.style.top = `${Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8)}px`;
            }
            stageEl.addEventListener("mouseleave", () => tip.classList.remove("is-on"));
            let ticking = false;
            function onScroll() {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(() => { update(); ticking = false; });
            }

            const CHROME_SLOP = 150;
            let lastW = window.innerWidth, lastH = window.innerHeight;
            let resizeQueued = false;

            function onResize() {
                const w = window.innerWidth, h = window.innerHeight;
                if (w === lastW && Math.abs(h - lastH) < CHROME_SLOP) return;
                lastW = w; lastH = h;
                if (resizeQueued) return;
                resizeQueued = true;
                requestAnimationFrame(() => {
                    resizeQueued = false;

                    layout();
                    lastActive = -2; lastOffset = null; lastNeed = null;
                    update();
                });
            }

            layout();
            update();
            document.fonts?.ready.then(() => {
                layout();
                lastActive = -2; lastOffset = null; lastNeed = null;
                update();
            });
            window.addEventListener("scroll", onScroll, { passive: true });
            window.addEventListener("resize", onResize);
            window.addEventListener("orientationchange", () => {
                requestAnimationFrame(() => {
                    lastW = window.innerWidth; lastH = window.innerHeight;
                    layout();
                    lastActive = -2; lastOffset = null; lastNeed = null;
                    update();
                });
            });
        })
        .catch((err) => console.error("daily upvotes chart error", err));
});
