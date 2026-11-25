<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as m from '#lib/paraglide/messages.js';
	import Settings from '@lucide/svelte/icons/settings';
	import Camera from '@lucide/svelte/icons/camera';
	import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import VolumeX from '@lucide/svelte/icons/volume-x';

	let {
		model,
		cameraId = $bindable(''),
		sound = $bindable(false),
		onmodelchange,
		onopenchange,
		compact = false
	}: {
		model: 'mediapipe' | 'movenet';
		cameraId?: string;
		sound?: boolean;
		onmodelchange: (model: 'mediapipe' | 'movenet') => void;
		onopenchange?: (open: boolean) => void;
		compact?: boolean;
	} = $props();
	let devices = $state<MediaDeviceInfo[]>([]);
	let error = $state(false);
	let requesting = $state(false);

	async function refresh() {
		try {
			devices = (await navigator.mediaDevices.enumerateDevices()).filter(
				(device) => device.kind === 'videoinput' && device.deviceId
			);
			error = false;
		} catch {
			error = true;
		}
	}
	async function allowCameras() {
		requesting = true;
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
			stream.getTracks().forEach((track) => track.stop());
			await refresh();
		} catch {
			error = true;
		} finally {
			requesting = false;
		}
	}
	onMount(() => {
		const changed = () => void refresh();
		navigator.mediaDevices?.addEventListener('devicechange', changed);
		return () => navigator.mediaDevices?.removeEventListener('devicechange', changed);
	});
</script>

<DropdownMenu.Root
	onOpenChange={(open: boolean) => {
		onopenchange?.(open);
		if (open) void refresh();
	}}
>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant={compact ? 'ghost' : 'outline'}
				size={compact ? 'icon-lg' : 'default'}
				aria-label={m.setup_settings()}
				title={m.setup_settings()}
			>
				<Settings data-icon={compact ? undefined : 'inline-start'} />
				{#if !compact}{m.setup_settings()}{/if}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="min-w-fit">
		<DropdownMenu.Group>
			<DropdownMenu.CheckboxItem bind:checked={sound}>
				{#if sound}<Volume2 />{:else}<VolumeX />{/if}{m.setup_sound()}
			</DropdownMenu.CheckboxItem>
		</DropdownMenu.Group>
		<DropdownMenu.Separator />
		<DropdownMenu.Group>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger><Camera />{m.camera_select()}</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent class="max-w-[calc(100vw-2rem)]">
					<DropdownMenu.RadioGroup bind:value={cameraId} aria-label={m.camera_select()}>
						<DropdownMenu.RadioItem closeOnSelect value="">
							{m.camera_default()}
						</DropdownMenu.RadioItem>
						{#each devices as device, i (device.deviceId)}
							<DropdownMenu.RadioItem closeOnSelect value={device.deviceId}>
								{device.label || m.camera_number({ n: i + 1 })}
							</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
					{#if !devices.length || devices.some((device) => !device.label)}
						<DropdownMenu.Group>
							<DropdownMenu.Item disabled={requesting} onSelect={() => void allowCameras()}>
								{m.camera_allow()}
							</DropdownMenu.Item>
						</DropdownMenu.Group>
					{/if}
					{#if error}
						<DropdownMenu.Group>
							<DropdownMenu.Item disabled>{m.camera_error()}</DropdownMenu.Item>
						</DropdownMenu.Group>
					{/if}
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger><BrainCircuit />{m.setup_model()}</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<DropdownMenu.RadioGroup
						value={model}
						onValueChange={(value: string) => {
							if (value === 'mediapipe' || value === 'movenet') onmodelchange(value);
						}}
						aria-label={m.setup_model()}
					>
						<DropdownMenu.RadioItem closeOnSelect value="mediapipe">
							{m.setup_mp()}
						</DropdownMenu.RadioItem>
						<DropdownMenu.RadioItem closeOnSelect value="movenet">
							{m.setup_mn()}
						</DropdownMenu.RadioItem>
					</DropdownMenu.RadioGroup>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
