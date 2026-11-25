import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context, Service } from '@deepseek-ai/cordis';
import * as plugin from '../index.js';

/** A stand-in for @deepseek-ai/dsh-agent-default-model: saveSelection writes the profile. */
class DefaultModel extends Service {
	constructor(ctx) {
		super(ctx, 'agentDefaultModel');
		this.saved = [];
	}
	currentSelection() {
		return { provider: 'claude-code', model: 'claude-opus-5-5', reasoningEffort: 'high' };
	}
	async saveSelection(next) {
		this.saved.push(next);
	}
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** Calls saveSelection the way the session controller does: from another plugin's context. */
async function pick(ctx, selection) {
	await new Promise((resolve, reject) => {
		ctx.plugin({
			name: 'picker',
			inject: ['agentDefaultModel'],
			apply: (inner) => { inner.agentDefaultModel.saveSelection(selection).then(resolve, reject); },
		});
	});
}

test('a model pick leaves the default as it was', async () => {
	const root = new Context();
	root.plugin(DefaultModel);
	root.plugin(plugin);
	await settle();
	await pick(root, { provider: 'claude-code', model: 'claude-sonnet-5-5' });
	assert.deepEqual(root.get('agentDefaultModel').saved, []);
	assert.equal(root.get('agentDefaultModel').currentSelection().model, 'claude-opus-5-5');
});

test('unloading the plugin gives the default service its saving back', async () => {
	const root = new Context();
	root.plugin(DefaultModel);
	const fiber = root.plugin(plugin);
	await settle();
	fiber.dispose();
	await settle();
	await pick(root, { provider: 'claude-code', model: 'claude-sonnet-5-5' });
	assert.deepEqual(root.get('agentDefaultModel').saved, [{ provider: 'claude-code', model: 'claude-sonnet-5-5' }]);
});

test('a reloaded default service is covered again', async () => {
	const root = new Context();
	const first = root.plugin(DefaultModel);
	root.plugin(plugin);
	await settle();
	first.dispose();
	await settle();
	root.plugin(DefaultModel);
	await settle();
	await pick(root, { provider: 'claude-code', model: 'claude-sonnet-5-5' });
	assert.deepEqual(root.get('agentDefaultModel').saved, []);
});
