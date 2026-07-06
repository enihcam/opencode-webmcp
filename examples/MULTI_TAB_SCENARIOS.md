# Multi-Tab Scenarios

Three practical scenarios demonstrating the bridge's tab management features.

---

## Scenario 1: Side-by-Side Comparison

Compare two WebMCP pages without losing context.

1. Open the first page:
   ```
   webmcp_navigate({ url: "http://localhost:8080/imperative-tools.html" })
   ```

2. Open a second tab:
   ```
   webmcp_open_tab({ url: "http://localhost:8080/declarative-search.html" })
   ```
   Note: `open_tab` does NOT switch the active tab. Tab 1 (imperative) is still active.

3. Verify both tabs exist:
   ```
   webmcp_list_tabs({})
   ```
   Expected: two tabs with different `tabId`s and URLs.

4. Switch to tab 2 and inspect its tools:
   ```
   webmcp_switch_tab({ tabId: "<tab2-id>" })
   webmcp_status({})
   ```
   Tool list should now show the declarative page's tools (`search`, `add_to_cart`, `checkout`).

5. Invoke a tool on tab 2 by targeting it explicitly (without switching):
   ```
   webmcp_invoke_tool({ name: "search", args: { q: "widgets" }, tabId: "<tab2-id>" })
   ```

6. Switch back to tab 1:
   ```
   webmcp_switch_tab({ tabId: "<tab1-id>" })
   ```

---

## Scenario 2: Reference Tab Pattern

Keep a "reference" page open in one tab while working in another — useful for documentation, API specs, or dashboards.

1. Open the annotation reference:
   ```
   webmcp_navigate({ url: "http://localhost:8080/annotation-demo.html" })
   ```

2. Note the tab ID, then open a new tab for your work:
   ```
   webmcp_open_tab({ url: "http://localhost:8080/imperative-tools.html" })
   webmcp_switch_tab({ tabId: "<new-tab-id>" })
   ```

3. If you need to check annotation metadata mid-session, query the reference tab explicitly:
   ```
   webmcp_evaluate({
     code: "document.querySelector('.tool-card').textContent",
     tabId: "<reference-tab-id>"
   })
   ```
   The active tab doesn't change — your work context is preserved.

4. Close the reference tab when done:
   ```
   webmcp_close_tab({ tabId: "<reference-tab-id>" })
   ```

---

## Scenario 3: Dashboard Monitoring

Monitor a dashboard page on a dedicated tab while operating on another.

1. Open a monitoring tab with a dashboard:
   ```
   webmcp_navigate({ url: "http://localhost:8080/imperative-tools.html" })
   ```
   This is now tab 1 and the active tab.

2. Note the tab ID, then open a working tab:
   ```
   webmcp_open_tab({ url: "http://localhost:8080/mixed-dashboard.html" })
   webmcp_switch_tab({ tabId: "<working-tab-id>" })
   ```

3. Periodically check the monitoring tab without switching:
   ```
   webmcp_status({ tabId: "<monitor-tab-id>" })
   ```
   Returns the monitor tab's URL, tool count, and connection status. The active tab stays as the working tab.

4. Take a screenshot of the monitor tab:
   ```
   webmcp_screenshot({ tabId: "<monitor-tab-id>", format: "jpeg" })
   ```
   Returns a screenshot of the monitoring tab while you keep working on the other tab.

5. Read the monitor tab's data:
   ```
   webmcp_evaluate({
     code: "document.getElementById('dashboard-value')?.textContent",
     tabId: "<monitor-tab-id>"
   })
   ```

---

## Tab Management Tips

| Operation | Method | Notes |
|---|---|---|
| Open new tab | `webmcp_open_tab` | Active tab unchanged |
| Switch active | `webmcp_switch_tab` | Provide tabId |
| Target a tab | Set `tabId` param | Works on navigate, evaluate, invoke_tool, screenshot, register_test_tools |
| List all tabs | `webmcp_list_tabs` | Shows URL, title, active status |
| Close tab | `webmcp_close_tab` | Cannot close the last tab |
| Recover from detach | Automatic | The bridge recreates the page; retry the tool call |
