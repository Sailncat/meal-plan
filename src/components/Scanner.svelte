<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getDetector, validBarcode, type Detector } from '../lib/scan';

  interface Props {
    onresult: (code: string) => void;
  }
  let { onresult }: Props = $props();

  let video: HTMLVideoElement | undefined = $state();
  let stream: MediaStream | null = null;
  let status = $state<'starting' | 'live' | 'nocamera' | 'denied' | 'photo-fail' | 'reading'>('starting');
  let typed = $state('');
  let typedError = $state('');
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function finish(code: string) {
    if (done) return;
    done = true;
    stop();
    if (navigator.vibrate) navigator.vibrate(40);
    onresult(code);
  }

  function stop() {
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function loop(detector: Detector) {
    if (done || !video || !stream) return;
    if (video.readyState >= 2) {
      try {
        const found = await detector.detect(video);
        const hit = found.map((b) => b.rawValue.trim()).find(validBarcode);
        if (hit) return finish(hit);
      } catch {
        // a frame that can't be read; try the next one
      }
    }
    timer = setTimeout(() => loop(detector), 200);
  }

  onMount(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      status = 'nocamera';
      return;
    }
    try {
      const [s, detector] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false }),
        getDetector(),
      ]);
      if (done) return s.getTracks().forEach((t) => t.stop());
      stream = s;
      if (video) {
        video.srcObject = s;
        await video.play().catch(() => {});
      }
      status = 'live';
      loop(detector);
    } catch (e) {
      status = (e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'nocamera';
    }
  });

  onDestroy(() => {
    done = true;
    stop();
  });

  async function fromPhoto(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    status = 'reading';
    try {
      const [detector, bitmap] = await Promise.all([getDetector(), createImageBitmap(file)]);
      const found = await detector.detect(bitmap);
      const hit = found.map((b) => b.rawValue.trim()).find(validBarcode);
      if (hit) return finish(hit);
      status = 'photo-fail';
    } catch {
      status = 'photo-fail';
    }
  }

  function submitTyped(e: SubmitEvent) {
    e.preventDefault();
    const code = typed.replace(/\s/g, '');
    if (!/^\d{8,14}$/.test(code)) {
      typedError = 'A barcode is 8 to 14 digits.';
      return;
    }
    if (!validBarcode(code)) {
      typedError = 'That number doesn’t add up. Check for a typo.';
      return;
    }
    finish(code);
  }
</script>

<div class="scanner">
  <div class="view" class:off={status !== 'live' && status !== 'starting'}>
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} playsinline muted></video>
    {#if status === 'starting'}
      <p class="over-text">Starting the camera…</p>
    {:else if status === 'live'}
      <div class="aim" aria-hidden="true"></div>
      <p class="over-text bottom">Point it at the barcode</p>
    {:else}
      <p class="over-text">
        {#if status === 'denied'}
          The camera is blocked for this site. Allow it in the browser’s site settings, or use a photo.
        {:else if status === 'reading'}
          Reading the photo…
        {:else if status === 'photo-fail'}
          Couldn’t find a barcode in that photo. Try again closer, with the barcode flat and in focus.
        {:else}
          No camera available here. Use a photo of the barcode, or type the number.
        {/if}
      </p>
    {/if}
  </div>

  <label class="btn photo">
    Use a photo
    <input type="file" accept="image/*" capture="environment" onchange={fromPhoto} />
  </label>

  <form class="typed" onsubmit={submitTyped}>
    <label class="label" for="typed-code">Or type the number under the barcode</label>
    <div class="row">
      <input
        id="typed-code"
        class="field"
        inputmode="numeric"
        autocomplete="off"
        placeholder="e.g. 5901234123457"
        bind:value={typed}
        oninput={() => (typedError = '')}
      />
      <button class="btn" type="submit">Look up</button>
    </div>
    {#if typedError}<p class="note err">{typedError}</p>{/if}
  </form>
</div>

<style>
  .scanner {
    display: grid;
    gap: 0.75rem;
  }
  .view {
    position: relative;
    aspect-ratio: 4 / 3;
    max-height: 45dvh;
    width: 100%;
    background: #000;
    border-radius: 0.5rem;
    overflow: hidden;
  }
  .view.off {
    aspect-ratio: auto;
    min-height: 7rem;
    background: var(--total);
  }
  .view.off video {
    display: none;
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .aim {
    position: absolute;
    inset: 30% 12%;
    border: 2px solid rgba(255, 255, 255, 0.85);
    border-radius: 0.5rem;
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.35);
  }
  .over-text {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 1rem;
    text-align: center;
    color: #fff;
    font-weight: 600;
  }
  .view.off .over-text {
    position: static;
    color: var(--ink);
    font-weight: 400;
  }
  .over-text.bottom {
    inset: auto 0 0.5rem;
  }
  .photo {
    position: relative;
    overflow: hidden;
  }
  .photo input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  .row .btn {
    white-space: nowrap;
  }
  .err {
    color: var(--over);
  }
</style>
