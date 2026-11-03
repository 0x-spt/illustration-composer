// Illustration Composer: exports library nodes as SVG + PNG into figma-export.json.
// No build step. The node list below is generated from scripts/library-sync/library.config.ts
// (npm run library:plugin-nodes); do not edit it by hand.

// <GENERATED nodes: npm run library:plugin-nodes>
var EXPORT_NODES = [
  {"id":"21:29965","what":"book L main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:6273","what":"book L background","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:3810","what":"book S main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:6934","what":"book S background","svg":true,"png":true,"childrenSvg":false},
  {"id":"21:25472","what":"phone L main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:6327","what":"phone L background","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:4746","what":"phone S main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:6990","what":"phone S background","svg":true,"png":true,"childrenSvg":false},
  {"id":"21:417","what":"puzzle L main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:6214","what":"puzzle L background","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:4903","what":"puzzle S main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:7147","what":"puzzle S background","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:2207","what":"coin L main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:6795","what":"coin L background","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:5345","what":"coin S main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:7205","what":"coin S background","svg":true,"png":true,"childrenSvg":false},
  {"id":"23:122","what":"headphones L main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:6484","what":"headphones L background","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:5089","what":"headphones S main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:7344","what":"headphones S background","svg":true,"png":true,"childrenSvg":false},
  {"id":"23:121","what":"lamp L main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:6569","what":"lamp L background","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:5485","what":"lamp S main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:7429","what":"lamp S background","svg":true,"png":true,"childrenSvg":false},
  {"id":"28:11628","what":"vase L main","svg":true,"png":true,"childrenSvg":false},
  {"id":"30:11902","what":"vase L background","svg":true,"png":true,"childrenSvg":false},
  {"id":"28:11629","what":"vase S main","svg":true,"png":true,"childrenSvg":false},
  {"id":"28:11766","what":"vase S background","svg":true,"png":true,"childrenSvg":false},
  {"id":"23:211","what":"wallet L main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:6660","what":"wallet L background","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:4594","what":"wallet S main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:7568","what":"wallet S background","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:1899","what":"folder L main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:6772","what":"folder L background","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:4430","what":"folder S main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:7520","what":"folder S background","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:1734","what":"pen L main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:6747","what":"pen L background","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:4287","what":"pen S main","svg":true,"png":true,"childrenSvg":false},
  {"id":"24:7543","what":"pen S background","svg":true,"png":true,"childrenSvg":false},
  {"id":"21:25258","what":"фон L confetti-L","svg":false,"png":true,"childrenSvg":true},
  {"id":"21:29593","what":"фон L дубликат","svg":false,"png":true,"childrenSvg":true},
  {"id":"21:25399","what":"фон L corner-L","svg":false,"png":true,"childrenSvg":true},
  {"id":"24:5990","what":"фон S confetti-bold-S","svg":false,"png":true,"childrenSvg":true},
  {"id":"24:6055","what":"фон S confetti-S","svg":false,"png":true,"childrenSvg":true},
  {"id":"24:6120","what":"фон S corner-S","svg":false,"png":true,"childrenSvg":true},
];
// </GENERATED nodes>

var SVG_OPTIONS = {
  format: 'SVG_STRING',
  svgIdAttribute: true,
  svgOutlineText: false,
  svgSimplifyStroke: false,
};
var PNG_OPTIONS = { format: 'PNG', constraint: { type: 'SCALE', value: 0.5 } };

figma.showUI(__html__, { width: 360, height: 240 });

figma.ui.onmessage = function (msg) {
  if (!msg || msg.type !== 'export') return;
  runExport().then(
    function (result) {
      figma.ui.postMessage({ type: 'done', result: result });
    },
    function (err) {
      figma.ui.postMessage({ type: 'error', message: String((err && err.message) || err) });
    },
  );
};

async function runExport() {
  var svgs = {};
  var pngs = {};
  var missing = [];
  var jobs = [];

  for (var i = 0; i < EXPORT_NODES.length; i++) {
    var spec = EXPORT_NODES[i];
    var node = await figma.getNodeByIdAsync(spec.id);
    if (!node) {
      missing.push(spec.id + ' (' + spec.what + ')');
      continue;
    }
    if (spec.svg) jobs.push({ node: node, id: spec.id, kind: 'svg' });
    if (spec.png) jobs.push({ node: node, id: spec.id, kind: 'png' });
    if (spec.childrenSvg) {
      if (!('children' in node)) {
        missing.push(spec.id + ' (' + spec.what + ': нет детей)');
        continue;
      }
      for (var c = 0; c < node.children.length; c++) {
        var child = node.children[c];
        if (child.visible) jobs.push({ node: child, id: child.id, kind: 'svg' });
      }
    }
  }

  for (var j = 0; j < jobs.length; j++) {
    var job = jobs[j];
    try {
      if (job.kind === 'svg') {
        svgs[job.id] = await job.node.exportAsync(SVG_OPTIONS);
      } else {
        pngs[job.id] = figma.base64Encode(await job.node.exportAsync(PNG_OPTIONS));
      }
    } catch (err) {
      missing.push(job.id + ' (' + job.kind + ': ' + String((err && err.message) || err) + ')');
    }
    figma.ui.postMessage({ type: 'progress', done: j + 1, total: jobs.length });
  }

  return {
    fileKey: figma.fileKey || null,
    exportedAt: new Date().toISOString(),
    svgs: svgs,
    pngs: pngs,
    missing: missing,
  };
}
