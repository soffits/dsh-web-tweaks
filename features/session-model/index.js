/**
 * @soffits/dsh-session-model: a model picked in a session stays in that session.
 *
 * DSH saves every Web picker choice as the deployment default (agentDefaultModel.saveSelection),
 * so one chat's switch moves every later session. This plugin turns that save into a no-op while
 * it is loaded. The default is then whatever the profile's `agent-default-model` row says, and it
 * changes only where that row is edited (the profile patch or the Settings page).
 */
export const name = 'dsh-session-model';
export const inject = ['agentDefaultModel'];

/** Stands in for saveSelection; it accepts the selection and stores nothing. */
async function keepDefault() {}

export function apply(ctx) {
	const service = ctx.agentDefaultModel;
	ctx.effect(() => {
		service.saveSelection = keepDefault;
		return () => {
			if (Object.getOwnPropertyDescriptor(service, 'saveSelection')?.value === keepDefault) delete service.saveSelection;
		};
	});
	ctx.logger?.info?.('model picks now change only their own session; the default stays as the profile sets it');
}
