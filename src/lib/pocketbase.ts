import PocketBase from 'pocketbase';

const pbUrl = import.meta.env.VITE_POCKETBASE_URL || 'https://pb.indovinachi.asigo.cc';

export const pb = new PocketBase(pbUrl);
