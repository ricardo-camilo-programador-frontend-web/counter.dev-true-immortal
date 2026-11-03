customElements.define(
    tagName(),
    class extends HTMLElement {
        constructor() {
            super();
            this.last_sites = null;
            document.addEventListener("selector-daterange-fetched", (evt) => {
                this.handleDateRangeFetched(evt.detail);
            });
            // Back/forward already changed the URL. Restore the site without pushState.
            window.addEventListener("popstate", () => {
                this.onPopState();
            });
        }

        draw(dump) {
            // we need the whole drump because we resend it via the redraw event to
            // all other components
            this.dump = dump;

            var sites = Object.entries(dump.sites)
                .sort((a, b) => b[1].count - a[1].count)
                .map((i) => i[0]);

            // We don't redraw if nothing changed for this component because
            // redrawing closes the dropdown for the user.
            if (JSON.stringify(this.last_sites) === JSON.stringify(sites)) {
                return;
            }
            this.last_sites = sites;

            if (dump.meta.demo) {
                sites = ["counter.dev"];
            }

            // ?project= wins when it names a site we actually have. Demo mode
            // narrows `sites` above, so a project param cannot select a hidden site.
            var sitePref = this.chooseSite(sites);
            var rangePref = dump.user.prefs.range;

            this.style.display = "flex";

            this.innerHTML = `
        <div class="project mr16">
          <img width="16" height="16" alt="Favicon" id="selector-favicon">
          <select onchange="onSiteChanged()" id="site-select">
            ${sites.map((site) => `<option ${sitePref === site ? "selected=selected" : ""}value="${escapeHtml(site)}">${escapeHtml(site)}</option>`).join("")}
          </select>
        </div>
        <select onchange="onTimeRangeChanged()" id="range-select">
          <option ${rangePref === "day" ? "selected=selected" : ""} value="day">Today</option>
          <option ${rangePref === "yesterday" ? "selected=selected" : ""} value="yesterday">Yesterday</option>
          <option ${rangePref === "last7" ? "selected=selected" : ""} value="last7">Last 7 days</option>
          <option ${rangePref === "last30" ? "selected=selected" : ""} value="last30">Last 30 days</option>
          <option ${rangePref === "month" ? "selected=selected" : ""} value="month">This month</option>
          <option ${rangePref === "year" ? "selected=selected" : ""} value="year">This year</option>
          <option ${rangePref === "all" ? "selected=selected" : ""} value="all">All time</option>
        <option ${rangePref === "daterangeset" ? "selected=selected" : ""} value="daterangeset">Custom date range...</option>
        </select>`;

            this.updateFavicon();

            document.getElementById("site-select").onchange = (evt) => this.onSiteSelChanged(evt);
            document.getElementById("range-select").onchange = (evt) => this.onRangeSelChanged(evt);
            this.settleProjectUrl(sitePref, sites);
        }

        updateFavicon() {
            let favicon = document.getElementById("selector-favicon");
            favicon.src = `https://icons.duckduckgo.com/ip3/${this.site}.ico`;
        }

        // `false` is the popstate path and must not push another history entry.
        // The dropdown passes the change event, which is not `false`.
        onSiteSelChanged(updateHistory) {
            if (!this.dump || !this.site) {
                return;
            }
            this.updateFavicon();

            // request change up in the cloud and then also apply that change down
            // here in the client
            fetch("/setPrefSite?" + encodeURIComponent(this.site));
            this.dump.user.prefs.site = this.site;

            if (updateHistory !== false) {
                var url = new URL(window.location.href);
                url.searchParams.set("project", this.site);
                window.history.pushState({site: this.site}, "", url);
            }

            document.dispatchEvent(
                new CustomEvent("redraw", {
                    detail: this.dump,
                }),
            );
        }

        chooseSite(sites) {
            var project = new URLSearchParams(window.location.search).get("project");
            if (project && sites.includes(project)) {
                return project;
            }
            var stateSite = window.history.state && window.history.state.site;
            if (stateSite && sites.includes(stateSite)) {
                return stateSite;
            }
            if (sites.includes(this.dump.user.prefs.site)) {
                return this.dump.user.prefs.site;
            }
            return sites[0];
        }

        // Seed history.state so the first Back target still knows which site
        // was visible, and drop a ?project= that is not in `sites`.
        settleProjectUrl(site, sites) {
            if (!site) {
                return;
            }
            var url = new URL(window.location.href);
            var project = url.searchParams.get("project");
            var invalid = project !== null && !sites.includes(project);
            if (invalid) {
                url.searchParams.delete("project");
            }
            var state = window.history.state;
            if (invalid || !state || state.site !== site) {
                window.history.replaceState({site: site}, "", url);
            }
        }

        onPopState() {
            if (!this.dump) {
                return;
            }
            var select = document.getElementById("site-select");
            if (!select || !select.options.length) {
                return;
            }
            var sites = Array.from(select.options).map((opt) => opt.value);
            var site = this.chooseSite(sites);
            this.settleProjectUrl(site, sites);
            if (select.value !== site) {
                select.value = site;
                this.onSiteSelChanged(false);
            }
        }

        onRangeSelChanged(evt) {
            if (this.range == "daterangeset") {
                document.dispatchEvent(new Event("selector-daterange-fetch"));
                return;
            }

            // request change up in the cloud and then also apply that change down
            // here in the client
            if (this.range != "daterange") {
                fetch("/setPrefRange?" + encodeURIComponent(this.range));
            }
            this.dump.user.prefs.range = this.range;
            document.dispatchEvent(
                new CustomEvent("redraw", {
                    detail: this.dump,
                }),
            );
        }

        get site() {
            return this.innerHTML !== "" && document.getElementById("site-select").value;
        }

        get range() {
            return this.innerHTML !== "" && document.getElementById("range-select").value;
        }

        handleDateRangeFetched(obj) {
            let resp = obj.resp;
            let from = obj.from;
            let to = obj.to;
            if (from.isSame(to, "day")) {
                var tofrom = from.format("DD MMM");
            } else {
                var tofrom = from.format("DD MMM") + " - " + to.format("DD MMM");
            }
            let origArchiveTxt = $('#range-select option[value="daterangeset"]').text();
            $('#range-select option[value="daterange"]').remove();
            $('#range-select option[value="daterangeset"]').val("daterange").text(tofrom).after($("<option/>").attr("value", "daterangeset").text(origArchiveTxt));

            window.state.daterange;
            window.state.daterange = resp;
            patchDump(this.dump);

            document.dispatchEvent(
                new CustomEvent("redraw", {
                    detail: this.dump,
                }),
            );
        }
    },
);
