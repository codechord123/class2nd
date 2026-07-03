function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('스마트 학급 관리 시스템')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
