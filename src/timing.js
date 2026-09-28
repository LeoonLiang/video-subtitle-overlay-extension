(function attachTiming(globalObject) {
  function normalize(timing = {}) {
    return {
      rate: Number.isFinite(timing.rate) && timing.rate > 0 ? timing.rate : 1,
      delayMs: Number.isFinite(timing.delayMs) ? timing.delayMs : 0
    };
  }
  function subtitleTime(videoSeconds, timing) {
    const { rate, delayMs } = normalize(timing);
    return videoSeconds * rate + delayMs / 1000;
  }
  function videoTime(cueSeconds, timing) {
    const { rate, delayMs } = normalize(timing);
    return Math.max(0, (cueSeconds - delayMs / 1000) / rate);
  }
  function validateAnchor(cue, video) {
    if (!Number.isFinite(cue) || !Number.isFinite(video) || cue < 0 || video < 0) {
      throw new Error("请选择有效字幕，并在视频播放到对应台词时标记");
    }
  }
  function calibrateOne(cue, video, rate = 1) {
    validateAnchor(cue, video);
    const normalizedRate = normalize({ rate }).rate;
    return { rate: normalizedRate, delayMs: (cue - video * normalizedRate) * 1000 };
  }
  function calibrateTwo(first, second) {
    validateAnchor(first.cue, first.video);
    validateAnchor(second.cue, second.video);
    if (second.video <= first.video || second.cue <= first.cue) {
      throw new Error("第二个校准点必须选择更靠后的台词和视频时间");
    }
    const rate = (second.cue - first.cue) / (second.video - first.video);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("两个校准点无法计算有效的时间比例");
    return calibrateOne(first.cue, first.video, rate);
  }
  globalObject.__VSO_TIMING__ = { normalize, subtitleTime, videoTime, calibrateOne, calibrateTwo };
})(globalThis);
