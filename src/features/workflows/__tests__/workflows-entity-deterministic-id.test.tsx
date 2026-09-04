import { describe, it } from "node:test";
import assert from "node:assert";
import React from "react";
import { renderToString } from "react-dom/server";
import { EntityItem } from "@/components/entity-components";

describe("Phase 19: Workflows List SSR Hydration & Radix Deterministic Trigger ID", () => {
  it("1. Renders deterministic trigger button id derived from href across multiple render passes", () => {
    const itemProps = {
      href: "/workflows/workflow_abc123",
      title: "Automated Commerce Order Sync",
      onRemove: () => {},
    };

    // First SSR pass
    const htmlPass1 = renderToString(<EntityItem {...itemProps} />);

    // Second SSR pass
    const htmlPass2 = renderToString(<EntityItem {...itemProps} />);

    // Check that both render passes produce the exact deterministic ID
    assert.strictEqual(htmlPass1, htmlPass2);
    assert.ok(htmlPass1.includes('id="entity-menu-trigger--workflows-workflow_abc123"'));
    assert.ok(!htmlPass1.includes('id="radix-_R'));
  });

  it("2. Multiple distinct workflow items produce distinct deterministic trigger IDs without Radix pseudo-random collisions", () => {
    const html1 = renderToString(
      <EntityItem href="/workflows/wf_01" title="Workflow 1" onRemove={() => {}} />
    );
    const html2 = renderToString(
      <EntityItem href="/workflows/wf_02" title="Workflow 2" onRemove={() => {}} />
    );

    assert.ok(html1.includes('id="entity-menu-trigger--workflows-wf_01"'));
    assert.ok(html2.includes('id="entity-menu-trigger--workflows-wf_02"'));
    assert.notStrictEqual(html1, html2);
  });
});
