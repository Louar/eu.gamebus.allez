<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
</script>

<header
	class="hero isolate grid overflow-hidden rounded-2xl bg-background text-foreground min-[661px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
>
	<div
		class="relative z-1 self-center px-6 pt-6 min-[661px]:py-[clamp(26px,4vw,54px)] min-[661px]:pr-0 min-[661px]:pl-[clamp(24px,4vw,52px)]"
	>
		<div
			class="flex items-center gap-2.5 font-mono text-[10px] leading-[1.4] font-semibold tracking-[0.14em] text-(--hero-kicker) uppercase"
		>
			<i
				class="h-2 w-[22px] bg-[repeating-linear-gradient(117deg,#ff9954_0_4px,transparent_4px_7px)]"
			></i>{m.setup_kicker()}
		</div>
		<h1
			class="mt-3.5 mb-3 text-[clamp(2.7rem,9vw,3.7rem)] leading-[1.02] font-[750] tracking-[-0.065em] min-[661px]:text-[clamp(3rem,5.5vw,4.65rem)]"
		>
			{m.setup_title()}<span class="text-primary" aria-hidden="true">.</span>
		</h1>
		<p
			class="m-0 max-w-[42ch] text-[clamp(0.875rem,1.5vw,1rem)] leading-[1.55] text-muted-foreground"
		>
			{m.setup_intro()}
		</p>
	</div>
	<figure
		class="relative m-0 ml-auto min-h-[155px] w-full max-w-[400px] min-[661px]:min-h-[216px] min-[661px]:max-w-none"
	>
		<svg
			class="absolute size-full object-contain"
			viewBox="0 0 480 250"
			preserveAspectRatio="xMidYMid slice"
			aria-hidden="true"
			focusable="false"
		>
			<defs>
				<pattern id="studio-grid" width="24" height="24" patternUnits="userSpaceOnUse">
					<path d="M24 0H0V24" fill="none" stroke="#43484b" stroke-width=".8" />
				</pattern>
				<linearGradient id="studio-fade">
					<stop stop-color="#1c2126" /><stop offset=".42" stop-color="#1c2126" stop-opacity="0" />
				</linearGradient>
			</defs>
			<rect width="480" height="250" fill="url(#studio-grid)" />
			<g fill="none" stroke="#967958" stroke-width=".8" opacity=".7">
				<ellipse cx="255" cy="135" rx="208" ry="73" transform="rotate(-18 255 135)" /><ellipse
					cx="255"
					cy="135"
					rx="221"
					ry="83"
					transform="rotate(-18 255 135)"
				/>
				<path d="M50 223H454M371 23V218" stroke-dasharray="2 5" />
			</g>
			<g stroke="#dda960" fill="none">
				<path d="M114 87h77m-103 7h76m-24 34h46M74 174h67m-96 8h83" /><path
					d="M419 30h8m-4-4v8M71 207h8m-4-4v8"
				/>
			</g>
			<!-- A cut-paper sprinter: rear limbs in vermilion, near planes in amber. -->
			<g transform="translate(7,-2)">
				<path fill="#c85525" d="m259 85-35 18-43-21-10 3 2 8 49 33q7 4 16-1l37-21z" />
				<path fill="#ef8a40" d="m183 83-13-10-15 1-8 6 17 1 7 6 11 5z" />
				<path fill="#d56029" d="m244 129 28 10 32 27q9 10-2 20l-45 33-12 2-4-9 34-37-39-19z" />
				<path fill="#ff9b4e" d="m248 207 6 9-12 15-29 7-11-2 1-4 22-12 13-13z" />
				<path fill="#fc9847" d="m232 122 27 17-45 40q-6 8-17 7l-57-10-16-8 7-9 65 4z" />
				<path fill="#ffbd68" d="m197 163 30-37 20 7-44 41-58-7-12-8z" />
				<path fill="#ffd087" d="m137 156-6 19-15-1-9 16-10 4-1-5 8-27 10-10 15 7z" />
				<path fill="#ed772f" d="m232 116 11-22 21-22 17-3 22 14-10 23-24 18-11 18-29-16z" />
				<path fill="#ffb45c" d="m245 95 20-23 16-3 12 8-18 25-36 19z" />
				<path fill="#f6a256" d="m283 76 7-14 16 2-3 18-11 6z" />
				<path fill="#ffd08a" d="m288 50 8-13 18-3 12 9-1 10 4 7-6 3-5 12-12 1-13-10z" />
				<path fill="#e17436" d="m288 61-6-7 3-14 13-10 14-1 14 7 3 8-17 3-9 10-6-2-3 8z" />
				<path
					fill="#ffac55"
					d="m280 82 10-4 10 6 19 19 30-22 6 8-30 34q-6 6-13 1l-34-24q-11-10 2-18z"
				/>
				<path fill="#ffd390" d="m347 84 5-14 9-6 7 2 5 6-3 3-10-1-5 14-7 3z" />
				<g fill="none" stroke="#824820" stroke-width="1.4">
					<path d="m249 105 17-22m-33 44 22 11m54-40 12 13 19-13m-133 74-12 6-38-7" />
				</g>
			</g>
			<rect width="145" height="250" fill="url(#studio-fade)" />
		</svg>
	</figure>
</header>

<style>
	.hero {
		--background: #1c2126;
		--foreground: #fff8ec;
		--primary: #ff954c;
		--muted-foreground: #ced1d1;
		--hero-kicker: #ffc18c;
	}
</style>
