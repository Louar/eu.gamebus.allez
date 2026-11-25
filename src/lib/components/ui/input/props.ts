import type { WithElementRef } from '#lib/utils.js';
import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

export type InputProps = WithElementRef<
	Omit<HTMLInputAttributes, 'type' | 'value'> & { value?: string | number | null } & (
			| { type: 'file'; files?: FileList | null }
			| { type?: Exclude<HTMLInputTypeAttribute, 'file'>; files?: undefined }
		)
>;
