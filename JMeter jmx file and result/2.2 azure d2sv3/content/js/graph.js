/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? -25200000 : 0;
        var yOffset = options.yaxis.mode === "time" ? -25200000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 306341.0, "minX": 0.0, "maxY": 348386.0, "series": [{"data": [[0.0, 306341.0], [0.1, 306341.0], [0.2, 306341.0], [0.3, 306341.0], [0.4, 306341.0], [0.5, 306341.0], [0.6, 306341.0], [0.7, 306341.0], [0.8, 306341.0], [0.9, 311893.0], [1.0, 311893.0], [1.1, 311893.0], [1.2, 311893.0], [1.3, 311893.0], [1.4, 311893.0], [1.5, 311893.0], [1.6, 311893.0], [1.7, 315022.0], [1.8, 315022.0], [1.9, 315022.0], [2.0, 315022.0], [2.1, 315022.0], [2.2, 315022.0], [2.3, 315022.0], [2.4, 315022.0], [2.5, 315374.0], [2.6, 315374.0], [2.7, 315374.0], [2.8, 315374.0], [2.9, 315374.0], [3.0, 315374.0], [3.1, 315374.0], [3.2, 315374.0], [3.3, 315374.0], [3.4, 316676.0], [3.5, 316676.0], [3.6, 316676.0], [3.7, 316676.0], [3.8, 316676.0], [3.9, 316676.0], [4.0, 316676.0], [4.1, 316676.0], [4.2, 317067.0], [4.3, 317067.0], [4.4, 317067.0], [4.5, 317067.0], [4.6, 317067.0], [4.7, 317067.0], [4.8, 317067.0], [4.9, 317067.0], [5.0, 317310.0], [5.1, 317310.0], [5.2, 317310.0], [5.3, 317310.0], [5.4, 317310.0], [5.5, 317310.0], [5.6, 317310.0], [5.7, 317310.0], [5.8, 317310.0], [5.9, 317451.0], [6.0, 317451.0], [6.1, 317451.0], [6.2, 317451.0], [6.3, 317451.0], [6.4, 317451.0], [6.5, 317451.0], [6.6, 317451.0], [6.7, 317669.0], [6.8, 317669.0], [6.9, 317669.0], [7.0, 317669.0], [7.1, 317669.0], [7.2, 317669.0], [7.3, 317669.0], [7.4, 317669.0], [7.5, 319249.0], [7.6, 319249.0], [7.7, 319249.0], [7.8, 319249.0], [7.9, 319249.0], [8.0, 319249.0], [8.1, 319249.0], [8.2, 319249.0], [8.3, 319249.0], [8.4, 320136.0], [8.5, 320136.0], [8.6, 320136.0], [8.7, 320136.0], [8.8, 320136.0], [8.9, 320136.0], [9.0, 320136.0], [9.1, 320136.0], [9.2, 321134.0], [9.3, 321134.0], [9.4, 321134.0], [9.5, 321134.0], [9.6, 321134.0], [9.7, 321134.0], [9.8, 321134.0], [9.9, 321134.0], [10.0, 321252.0], [10.1, 321252.0], [10.2, 321252.0], [10.3, 321252.0], [10.4, 321252.0], [10.5, 321252.0], [10.6, 321252.0], [10.7, 321252.0], [10.8, 321252.0], [10.9, 321636.0], [11.0, 321636.0], [11.1, 321636.0], [11.2, 321636.0], [11.3, 321636.0], [11.4, 321636.0], [11.5, 321636.0], [11.6, 321636.0], [11.7, 322082.0], [11.8, 322082.0], [11.9, 322082.0], [12.0, 322082.0], [12.1, 322082.0], [12.2, 322082.0], [12.3, 322082.0], [12.4, 322082.0], [12.5, 322082.0], [12.6, 322252.0], [12.7, 322252.0], [12.8, 322252.0], [12.9, 322252.0], [13.0, 322252.0], [13.1, 322252.0], [13.2, 322252.0], [13.3, 322252.0], [13.4, 322953.0], [13.5, 322953.0], [13.6, 322953.0], [13.7, 322953.0], [13.8, 322953.0], [13.9, 322953.0], [14.0, 322953.0], [14.1, 322953.0], [14.2, 323877.0], [14.3, 323877.0], [14.4, 323877.0], [14.5, 323877.0], [14.6, 323877.0], [14.7, 323877.0], [14.8, 323877.0], [14.9, 323877.0], [15.0, 323877.0], [15.1, 323885.0], [15.2, 323885.0], [15.3, 323885.0], [15.4, 323885.0], [15.5, 323885.0], [15.6, 323885.0], [15.7, 323885.0], [15.8, 323885.0], [15.9, 324058.0], [16.0, 324058.0], [16.1, 324058.0], [16.2, 324058.0], [16.3, 324058.0], [16.4, 324058.0], [16.5, 324058.0], [16.6, 324058.0], [16.7, 324220.0], [16.8, 324220.0], [16.9, 324220.0], [17.0, 324220.0], [17.1, 324220.0], [17.2, 324220.0], [17.3, 324220.0], [17.4, 324220.0], [17.5, 324220.0], [17.6, 324288.0], [17.7, 324288.0], [17.8, 324288.0], [17.9, 324288.0], [18.0, 324288.0], [18.1, 324288.0], [18.2, 324288.0], [18.3, 324288.0], [18.4, 324358.0], [18.5, 324358.0], [18.6, 324358.0], [18.7, 324358.0], [18.8, 324358.0], [18.9, 324358.0], [19.0, 324358.0], [19.1, 324358.0], [19.2, 324453.0], [19.3, 324453.0], [19.4, 324453.0], [19.5, 324453.0], [19.6, 324453.0], [19.7, 324453.0], [19.8, 324453.0], [19.9, 324453.0], [20.0, 324808.0], [20.1, 324808.0], [20.2, 324808.0], [20.3, 324808.0], [20.4, 324808.0], [20.5, 324808.0], [20.6, 324808.0], [20.7, 324808.0], [20.8, 324808.0], [20.9, 324979.0], [21.0, 324979.0], [21.1, 324979.0], [21.2, 324979.0], [21.3, 324979.0], [21.4, 324979.0], [21.5, 324979.0], [21.6, 324979.0], [21.7, 325058.0], [21.8, 325058.0], [21.9, 325058.0], [22.0, 325058.0], [22.1, 325058.0], [22.2, 325058.0], [22.3, 325058.0], [22.4, 325058.0], [22.5, 325296.0], [22.6, 325296.0], [22.7, 325296.0], [22.8, 325296.0], [22.9, 325296.0], [23.0, 325296.0], [23.1, 325296.0], [23.2, 325296.0], [23.3, 325296.0], [23.4, 326136.0], [23.5, 326136.0], [23.6, 326136.0], [23.7, 326136.0], [23.8, 326136.0], [23.9, 326136.0], [24.0, 326136.0], [24.1, 326136.0], [24.2, 326942.0], [24.3, 326942.0], [24.4, 326942.0], [24.5, 326942.0], [24.6, 326942.0], [24.7, 326942.0], [24.8, 326942.0], [24.9, 326942.0], [25.0, 326963.0], [25.1, 326963.0], [25.2, 326963.0], [25.3, 326963.0], [25.4, 326963.0], [25.5, 326963.0], [25.6, 326963.0], [25.7, 326963.0], [25.8, 326963.0], [25.9, 326997.0], [26.0, 326997.0], [26.1, 326997.0], [26.2, 326997.0], [26.3, 326997.0], [26.4, 326997.0], [26.5, 326997.0], [26.6, 326997.0], [26.7, 327339.0], [26.8, 327339.0], [26.9, 327339.0], [27.0, 327339.0], [27.1, 327339.0], [27.2, 327339.0], [27.3, 327339.0], [27.4, 327339.0], [27.5, 327791.0], [27.6, 327791.0], [27.7, 327791.0], [27.8, 327791.0], [27.9, 327791.0], [28.0, 327791.0], [28.1, 327791.0], [28.2, 327791.0], [28.3, 327791.0], [28.4, 327885.0], [28.5, 327885.0], [28.6, 327885.0], [28.7, 327885.0], [28.8, 327885.0], [28.9, 327885.0], [29.0, 327885.0], [29.1, 327885.0], [29.2, 328000.0], [29.3, 328000.0], [29.4, 328000.0], [29.5, 328000.0], [29.6, 328000.0], [29.7, 328000.0], [29.8, 328000.0], [29.9, 328000.0], [30.0, 328130.0], [30.1, 328130.0], [30.2, 328130.0], [30.3, 328130.0], [30.4, 328130.0], [30.5, 328130.0], [30.6, 328130.0], [30.7, 328130.0], [30.8, 328130.0], [30.9, 328291.0], [31.0, 328291.0], [31.1, 328291.0], [31.2, 328291.0], [31.3, 328291.0], [31.4, 328291.0], [31.5, 328291.0], [31.6, 328291.0], [31.7, 328348.0], [31.8, 328348.0], [31.9, 328348.0], [32.0, 328348.0], [32.1, 328348.0], [32.2, 328348.0], [32.3, 328348.0], [32.4, 328348.0], [32.5, 328555.0], [32.6, 328555.0], [32.7, 328555.0], [32.8, 328555.0], [32.9, 328555.0], [33.0, 328555.0], [33.1, 328555.0], [33.2, 328555.0], [33.3, 328555.0], [33.4, 328717.0], [33.5, 328717.0], [33.6, 328717.0], [33.7, 328717.0], [33.8, 328717.0], [33.9, 328717.0], [34.0, 328717.0], [34.1, 328717.0], [34.2, 328983.0], [34.3, 328983.0], [34.4, 328983.0], [34.5, 328983.0], [34.6, 328983.0], [34.7, 328983.0], [34.8, 328983.0], [34.9, 328983.0], [35.0, 329038.0], [35.1, 329038.0], [35.2, 329038.0], [35.3, 329038.0], [35.4, 329038.0], [35.5, 329038.0], [35.6, 329038.0], [35.7, 329038.0], [35.8, 329038.0], [35.9, 329104.0], [36.0, 329104.0], [36.1, 329104.0], [36.2, 329104.0], [36.3, 329104.0], [36.4, 329104.0], [36.5, 329104.0], [36.6, 329104.0], [36.7, 329157.0], [36.8, 329157.0], [36.9, 329157.0], [37.0, 329157.0], [37.1, 329157.0], [37.2, 329157.0], [37.3, 329157.0], [37.4, 329157.0], [37.5, 329386.0], [37.6, 329386.0], [37.7, 329386.0], [37.8, 329386.0], [37.9, 329386.0], [38.0, 329386.0], [38.1, 329386.0], [38.2, 329386.0], [38.3, 329386.0], [38.4, 329627.0], [38.5, 329627.0], [38.6, 329627.0], [38.7, 329627.0], [38.8, 329627.0], [38.9, 329627.0], [39.0, 329627.0], [39.1, 329627.0], [39.2, 329754.0], [39.3, 329754.0], [39.4, 329754.0], [39.5, 329754.0], [39.6, 329754.0], [39.7, 329754.0], [39.8, 329754.0], [39.9, 329754.0], [40.0, 329754.0], [40.1, 330092.0], [40.2, 330092.0], [40.3, 330092.0], [40.4, 330092.0], [40.5, 330092.0], [40.6, 330092.0], [40.7, 330092.0], [40.8, 330092.0], [40.9, 330114.0], [41.0, 330114.0], [41.1, 330114.0], [41.2, 330114.0], [41.3, 330114.0], [41.4, 330114.0], [41.5, 330114.0], [41.6, 330114.0], [41.7, 330566.0], [41.8, 330566.0], [41.9, 330566.0], [42.0, 330566.0], [42.1, 330566.0], [42.2, 330566.0], [42.3, 330566.0], [42.4, 330566.0], [42.5, 330566.0], [42.6, 330613.0], [42.7, 330613.0], [42.8, 330613.0], [42.9, 330613.0], [43.0, 330613.0], [43.1, 330613.0], [43.2, 330613.0], [43.3, 330613.0], [43.4, 330904.0], [43.5, 330904.0], [43.6, 330904.0], [43.7, 330904.0], [43.8, 330904.0], [43.9, 330904.0], [44.0, 330904.0], [44.1, 330904.0], [44.2, 331254.0], [44.3, 331254.0], [44.4, 331254.0], [44.5, 331254.0], [44.6, 331254.0], [44.7, 331254.0], [44.8, 331254.0], [44.9, 331254.0], [45.0, 331254.0], [45.1, 331298.0], [45.2, 331298.0], [45.3, 331298.0], [45.4, 331298.0], [45.5, 331298.0], [45.6, 331298.0], [45.7, 331298.0], [45.8, 331298.0], [45.9, 331434.0], [46.0, 331434.0], [46.1, 331434.0], [46.2, 331434.0], [46.3, 331434.0], [46.4, 331434.0], [46.5, 331434.0], [46.6, 331434.0], [46.7, 331592.0], [46.8, 331592.0], [46.9, 331592.0], [47.0, 331592.0], [47.1, 331592.0], [47.2, 331592.0], [47.3, 331592.0], [47.4, 331592.0], [47.5, 331592.0], [47.6, 331697.0], [47.7, 331697.0], [47.8, 331697.0], [47.9, 331697.0], [48.0, 331697.0], [48.1, 331697.0], [48.2, 331697.0], [48.3, 331697.0], [48.4, 331737.0], [48.5, 331737.0], [48.6, 331737.0], [48.7, 331737.0], [48.8, 331737.0], [48.9, 331737.0], [49.0, 331737.0], [49.1, 331737.0], [49.2, 331740.0], [49.3, 331740.0], [49.4, 331740.0], [49.5, 331740.0], [49.6, 331740.0], [49.7, 331740.0], [49.8, 331740.0], [49.9, 331740.0], [50.0, 331740.0], [50.1, 331816.0], [50.2, 331816.0], [50.3, 331816.0], [50.4, 331816.0], [50.5, 331816.0], [50.6, 331816.0], [50.7, 331816.0], [50.8, 331816.0], [50.9, 331975.0], [51.0, 331975.0], [51.1, 331975.0], [51.2, 331975.0], [51.3, 331975.0], [51.4, 331975.0], [51.5, 331975.0], [51.6, 331975.0], [51.7, 332134.0], [51.8, 332134.0], [51.9, 332134.0], [52.0, 332134.0], [52.1, 332134.0], [52.2, 332134.0], [52.3, 332134.0], [52.4, 332134.0], [52.5, 332134.0], [52.6, 332167.0], [52.7, 332167.0], [52.8, 332167.0], [52.9, 332167.0], [53.0, 332167.0], [53.1, 332167.0], [53.2, 332167.0], [53.3, 332167.0], [53.4, 332236.0], [53.5, 332236.0], [53.6, 332236.0], [53.7, 332236.0], [53.8, 332236.0], [53.9, 332236.0], [54.0, 332236.0], [54.1, 332236.0], [54.2, 332323.0], [54.3, 332323.0], [54.4, 332323.0], [54.5, 332323.0], [54.6, 332323.0], [54.7, 332323.0], [54.8, 332323.0], [54.9, 332323.0], [55.0, 332323.0], [55.1, 332557.0], [55.2, 332557.0], [55.3, 332557.0], [55.4, 332557.0], [55.5, 332557.0], [55.6, 332557.0], [55.7, 332557.0], [55.8, 332557.0], [55.9, 332611.0], [56.0, 332611.0], [56.1, 332611.0], [56.2, 332611.0], [56.3, 332611.0], [56.4, 332611.0], [56.5, 332611.0], [56.6, 332611.0], [56.7, 333107.0], [56.8, 333107.0], [56.9, 333107.0], [57.0, 333107.0], [57.1, 333107.0], [57.2, 333107.0], [57.3, 333107.0], [57.4, 333107.0], [57.5, 333107.0], [57.6, 333114.0], [57.7, 333114.0], [57.8, 333114.0], [57.9, 333114.0], [58.0, 333114.0], [58.1, 333114.0], [58.2, 333114.0], [58.3, 333114.0], [58.4, 333121.0], [58.5, 333121.0], [58.6, 333121.0], [58.7, 333121.0], [58.8, 333121.0], [58.9, 333121.0], [59.0, 333121.0], [59.1, 333121.0], [59.2, 333222.0], [59.3, 333222.0], [59.4, 333222.0], [59.5, 333222.0], [59.6, 333222.0], [59.7, 333222.0], [59.8, 333222.0], [59.9, 333222.0], [60.0, 333222.0], [60.1, 333241.0], [60.2, 333241.0], [60.3, 333241.0], [60.4, 333241.0], [60.5, 333241.0], [60.6, 333241.0], [60.7, 333241.0], [60.8, 333241.0], [60.9, 333437.0], [61.0, 333437.0], [61.1, 333437.0], [61.2, 333437.0], [61.3, 333437.0], [61.4, 333437.0], [61.5, 333437.0], [61.6, 333437.0], [61.7, 333539.0], [61.8, 333539.0], [61.9, 333539.0], [62.0, 333539.0], [62.1, 333539.0], [62.2, 333539.0], [62.3, 333539.0], [62.4, 333539.0], [62.5, 333539.0], [62.6, 333790.0], [62.7, 333790.0], [62.8, 333790.0], [62.9, 333790.0], [63.0, 333790.0], [63.1, 333790.0], [63.2, 333790.0], [63.3, 333790.0], [63.4, 333856.0], [63.5, 333856.0], [63.6, 333856.0], [63.7, 333856.0], [63.8, 333856.0], [63.9, 333856.0], [64.0, 333856.0], [64.1, 333856.0], [64.2, 334010.0], [64.3, 334010.0], [64.4, 334010.0], [64.5, 334010.0], [64.6, 334010.0], [64.7, 334010.0], [64.8, 334010.0], [64.9, 334010.0], [65.0, 334010.0], [65.1, 334058.0], [65.2, 334058.0], [65.3, 334058.0], [65.4, 334058.0], [65.5, 334058.0], [65.6, 334058.0], [65.7, 334058.0], [65.8, 334058.0], [65.9, 334298.0], [66.0, 334298.0], [66.1, 334298.0], [66.2, 334298.0], [66.3, 334298.0], [66.4, 334298.0], [66.5, 334298.0], [66.6, 334298.0], [66.7, 334418.0], [66.8, 334418.0], [66.9, 334418.0], [67.0, 334418.0], [67.1, 334418.0], [67.2, 334418.0], [67.3, 334418.0], [67.4, 334418.0], [67.5, 334418.0], [67.6, 334540.0], [67.7, 334540.0], [67.8, 334540.0], [67.9, 334540.0], [68.0, 334540.0], [68.1, 334540.0], [68.2, 334540.0], [68.3, 334540.0], [68.4, 334563.0], [68.5, 334563.0], [68.6, 334563.0], [68.7, 334563.0], [68.8, 334563.0], [68.9, 334563.0], [69.0, 334563.0], [69.1, 334563.0], [69.2, 334833.0], [69.3, 334833.0], [69.4, 334833.0], [69.5, 334833.0], [69.6, 334833.0], [69.7, 334833.0], [69.8, 334833.0], [69.9, 334833.0], [70.0, 334833.0], [70.1, 334853.0], [70.2, 334853.0], [70.3, 334853.0], [70.4, 334853.0], [70.5, 334853.0], [70.6, 334853.0], [70.7, 334853.0], [70.8, 334853.0], [70.9, 334914.0], [71.0, 334914.0], [71.1, 334914.0], [71.2, 334914.0], [71.3, 334914.0], [71.4, 334914.0], [71.5, 334914.0], [71.6, 334914.0], [71.7, 335060.0], [71.8, 335060.0], [71.9, 335060.0], [72.0, 335060.0], [72.1, 335060.0], [72.2, 335060.0], [72.3, 335060.0], [72.4, 335060.0], [72.5, 335060.0], [72.6, 335167.0], [72.7, 335167.0], [72.8, 335167.0], [72.9, 335167.0], [73.0, 335167.0], [73.1, 335167.0], [73.2, 335167.0], [73.3, 335167.0], [73.4, 335205.0], [73.5, 335205.0], [73.6, 335205.0], [73.7, 335205.0], [73.8, 335205.0], [73.9, 335205.0], [74.0, 335205.0], [74.1, 335205.0], [74.2, 335968.0], [74.3, 335968.0], [74.4, 335968.0], [74.5, 335968.0], [74.6, 335968.0], [74.7, 335968.0], [74.8, 335968.0], [74.9, 335968.0], [75.0, 335968.0], [75.1, 336010.0], [75.2, 336010.0], [75.3, 336010.0], [75.4, 336010.0], [75.5, 336010.0], [75.6, 336010.0], [75.7, 336010.0], [75.8, 336010.0], [75.9, 336082.0], [76.0, 336082.0], [76.1, 336082.0], [76.2, 336082.0], [76.3, 336082.0], [76.4, 336082.0], [76.5, 336082.0], [76.6, 336082.0], [76.7, 336100.0], [76.8, 336100.0], [76.9, 336100.0], [77.0, 336100.0], [77.1, 336100.0], [77.2, 336100.0], [77.3, 336100.0], [77.4, 336100.0], [77.5, 336125.0], [77.6, 336125.0], [77.7, 336125.0], [77.8, 336125.0], [77.9, 336125.0], [78.0, 336125.0], [78.1, 336125.0], [78.2, 336125.0], [78.3, 336125.0], [78.4, 336158.0], [78.5, 336158.0], [78.6, 336158.0], [78.7, 336158.0], [78.8, 336158.0], [78.9, 336158.0], [79.0, 336158.0], [79.1, 336158.0], [79.2, 336271.0], [79.3, 336271.0], [79.4, 336271.0], [79.5, 336271.0], [79.6, 336271.0], [79.7, 336271.0], [79.8, 336271.0], [79.9, 336271.0], [80.0, 336337.0], [80.1, 336337.0], [80.2, 336337.0], [80.3, 336337.0], [80.4, 336337.0], [80.5, 336337.0], [80.6, 336337.0], [80.7, 336337.0], [80.8, 336337.0], [80.9, 336424.0], [81.0, 336424.0], [81.1, 336424.0], [81.2, 336424.0], [81.3, 336424.0], [81.4, 336424.0], [81.5, 336424.0], [81.6, 336424.0], [81.7, 336670.0], [81.8, 336670.0], [81.9, 336670.0], [82.0, 336670.0], [82.1, 336670.0], [82.2, 336670.0], [82.3, 336670.0], [82.4, 336670.0], [82.5, 336744.0], [82.6, 336744.0], [82.7, 336744.0], [82.8, 336744.0], [82.9, 336744.0], [83.0, 336744.0], [83.1, 336744.0], [83.2, 336744.0], [83.3, 336744.0], [83.4, 336886.0], [83.5, 336886.0], [83.6, 336886.0], [83.7, 336886.0], [83.8, 336886.0], [83.9, 336886.0], [84.0, 336886.0], [84.1, 336886.0], [84.2, 337157.0], [84.3, 337157.0], [84.4, 337157.0], [84.5, 337157.0], [84.6, 337157.0], [84.7, 337157.0], [84.8, 337157.0], [84.9, 337157.0], [85.0, 337500.0], [85.1, 337500.0], [85.2, 337500.0], [85.3, 337500.0], [85.4, 337500.0], [85.5, 337500.0], [85.6, 337500.0], [85.7, 337500.0], [85.8, 337500.0], [85.9, 337996.0], [86.0, 337996.0], [86.1, 337996.0], [86.2, 337996.0], [86.3, 337996.0], [86.4, 337996.0], [86.5, 337996.0], [86.6, 337996.0], [86.7, 338191.0], [86.8, 338191.0], [86.9, 338191.0], [87.0, 338191.0], [87.1, 338191.0], [87.2, 338191.0], [87.3, 338191.0], [87.4, 338191.0], [87.5, 338721.0], [87.6, 338721.0], [87.7, 338721.0], [87.8, 338721.0], [87.9, 338721.0], [88.0, 338721.0], [88.1, 338721.0], [88.2, 338721.0], [88.3, 338721.0], [88.4, 338790.0], [88.5, 338790.0], [88.6, 338790.0], [88.7, 338790.0], [88.8, 338790.0], [88.9, 338790.0], [89.0, 338790.0], [89.1, 338790.0], [89.2, 338987.0], [89.3, 338987.0], [89.4, 338987.0], [89.5, 338987.0], [89.6, 338987.0], [89.7, 338987.0], [89.8, 338987.0], [89.9, 338987.0], [90.0, 339534.0], [90.1, 339534.0], [90.2, 339534.0], [90.3, 339534.0], [90.4, 339534.0], [90.5, 339534.0], [90.6, 339534.0], [90.7, 339534.0], [90.8, 339534.0], [90.9, 339550.0], [91.0, 339550.0], [91.1, 339550.0], [91.2, 339550.0], [91.3, 339550.0], [91.4, 339550.0], [91.5, 339550.0], [91.6, 339550.0], [91.7, 340100.0], [91.8, 340100.0], [91.9, 340100.0], [92.0, 340100.0], [92.1, 340100.0], [92.2, 340100.0], [92.3, 340100.0], [92.4, 340100.0], [92.5, 340184.0], [92.6, 340184.0], [92.7, 340184.0], [92.8, 340184.0], [92.9, 340184.0], [93.0, 340184.0], [93.1, 340184.0], [93.2, 340184.0], [93.3, 340184.0], [93.4, 340384.0], [93.5, 340384.0], [93.6, 340384.0], [93.7, 340384.0], [93.8, 340384.0], [93.9, 340384.0], [94.0, 340384.0], [94.1, 340384.0], [94.2, 340449.0], [94.3, 340449.0], [94.4, 340449.0], [94.5, 340449.0], [94.6, 340449.0], [94.7, 340449.0], [94.8, 340449.0], [94.9, 340449.0], [95.0, 340488.0], [95.1, 340488.0], [95.2, 340488.0], [95.3, 340488.0], [95.4, 340488.0], [95.5, 340488.0], [95.6, 340488.0], [95.7, 340488.0], [95.8, 340488.0], [95.9, 340729.0], [96.0, 340729.0], [96.1, 340729.0], [96.2, 340729.0], [96.3, 340729.0], [96.4, 340729.0], [96.5, 340729.0], [96.6, 340729.0], [96.7, 340948.0], [96.8, 340948.0], [96.9, 340948.0], [97.0, 340948.0], [97.1, 340948.0], [97.2, 340948.0], [97.3, 340948.0], [97.4, 340948.0], [97.5, 341416.0], [97.6, 341416.0], [97.7, 341416.0], [97.8, 341416.0], [97.9, 341416.0], [98.0, 341416.0], [98.1, 341416.0], [98.2, 341416.0], [98.3, 341416.0], [98.4, 342028.0], [98.5, 342028.0], [98.6, 342028.0], [98.7, 342028.0], [98.8, 342028.0], [98.9, 342028.0], [99.0, 342028.0], [99.1, 342028.0], [99.2, 348386.0], [99.3, 348386.0], [99.4, 348386.0], [99.5, 348386.0], [99.6, 348386.0], [99.7, 348386.0], [99.8, 348386.0], [99.9, 348386.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 306300.0, "maxY": 3.0, "series": [{"data": [[327300.0, 1.0], [328900.0, 1.0], [332100.0, 2.0], [333700.0, 1.0], [340100.0, 2.0], [330500.0, 1.0], [324800.0, 1.0], [321600.0, 1.0], [328000.0, 1.0], [334400.0, 1.0], [336000.0, 2.0], [329600.0, 1.0], [331200.0, 2.0], [324300.0, 1.0], [321100.0, 1.0], [329100.0, 2.0], [337100.0, 1.0], [340300.0, 1.0], [332300.0, 1.0], [338700.0, 2.0], [348300.0, 1.0], [317000.0, 1.0], [325000.0, 1.0], [336200.0, 1.0], [328200.0, 1.0], [331400.0, 1.0], [326100.0, 1.0], [322900.0, 1.0], [327700.0, 1.0], [330900.0, 1.0], [332500.0, 1.0], [338900.0, 1.0], [329300.0, 1.0], [322000.0, 1.0], [325200.0, 1.0], [334800.0, 2.0], [331600.0, 1.0], [333200.0, 2.0], [330000.0, 1.0], [336400.0, 1.0], [337500.0, 1.0], [340700.0, 1.0], [335900.0, 1.0], [317400.0, 1.0], [322200.0, 1.0], [323800.0, 2.0], [333400.0, 1.0], [341400.0, 1.0], [336600.0, 1.0], [335000.0, 1.0], [331800.0, 1.0], [315300.0, 1.0], [320100.0, 1.0], [324900.0, 1.0], [329700.0, 1.0], [336100.0, 3.0], [334500.0, 2.0], [340900.0, 1.0], [328100.0, 1.0], [317600.0, 1.0], [324000.0, 1.0], [319200.0, 1.0], [335200.0, 1.0], [336800.0, 1.0], [336300.0, 1.0], [328300.0, 1.0], [331500.0, 1.0], [337900.0, 1.0], [339500.0, 2.0], [333100.0, 3.0], [324200.0, 2.0], [333800.0, 1.0], [329000.0, 1.0], [332200.0, 1.0], [330600.0, 1.0], [317300.0, 1.0], [326900.0, 3.0], [330100.0, 1.0], [331700.0, 2.0], [334900.0, 1.0], [328500.0, 1.0], [338100.0, 1.0], [324400.0, 1.0], [321200.0, 1.0], [334000.0, 2.0], [342000.0, 1.0], [340400.0, 2.0], [306300.0, 1.0], [335100.0, 1.0], [328700.0, 1.0], [336700.0, 1.0], [331900.0, 1.0], [333500.0, 1.0], [311800.0, 1.0], [316600.0, 1.0], [315000.0, 1.0], [327800.0, 1.0], [334200.0, 1.0], [332600.0, 1.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 348300.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 120.0, "minX": 2.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 120.0, "series": [{"data": [[2.0, 120.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 30.084745762711865, "minX": 1.52081082E12, "maxY": 60.0, "series": [{"data": [[1.52081088E12, 60.0], [1.52081112E12, 60.0], [1.52081082E12, 60.0], [1.52081118E12, 30.084745762711865]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081118E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 322953.0, "minX": 1.0, "maxY": 348386.0, "series": [{"data": [[2.0, 331434.0], [3.0, 333790.0], [4.0, 332323.0], [5.0, 322953.0], [6.0, 330613.0], [7.0, 330566.0], [8.0, 328130.0], [9.0, 331298.0], [10.0, 329104.0], [11.0, 328291.0], [12.0, 331254.0], [13.0, 336424.0], [14.0, 336010.0], [15.0, 335968.0], [16.0, 327339.0], [17.0, 333539.0], [18.0, 331816.0], [19.0, 330092.0], [21.0, 333648.0], [22.0, 333107.0], [23.0, 329038.0], [24.0, 340449.0], [25.0, 333222.0], [27.0, 335057.5], [28.0, 340184.0], [29.0, 336670.0], [30.0, 340729.0], [31.0, 340948.0], [33.0, 333856.0], [32.0, 333241.0], [35.0, 333088.5], [36.0, 348386.0], [39.0, 339534.0], [38.0, 338093.5], [41.0, 333121.0], [40.0, 336271.0], [43.0, 338755.5], [45.0, 336886.0], [44.0, 337500.0], [47.0, 336100.0], [46.0, 340100.0], [49.0, 333114.0], [48.0, 332611.0], [51.0, 331697.0], [50.0, 339550.0], [53.0, 331975.0], [52.0, 340384.0], [55.0, 336744.0], [54.0, 341416.0], [57.0, 337157.0], [56.0, 334563.0], [59.0, 328717.0], [58.0, 334853.0], [60.0, 326962.2950819673], [1.0, 329386.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[45.29166666666667, 330703.65833333327]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 60.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 2.1166666666666667, "minX": 1.52081082E12, "maxY": 42571.45, "series": [{"data": [[1.52081088E12, 8658.6], [1.52081112E12, 721.55], [1.52081082E12, 34634.4], [1.52081118E12, 42571.45]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52081088E12, 25.4], [1.52081112E12, 2.1166666666666667], [1.52081082E12, 101.6], [1.52081118E12, 124.88333333333334]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081118E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 324631.91666666674, "minX": 1.52081082E12, "maxY": 336151.0833333334, "series": [{"data": [[1.52081088E12, 336151.0833333334], [1.52081112E12, 328555.0], [1.52081082E12, 324631.91666666674], [1.52081118E12, 334571.8474576272]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52081118E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 58329.70833333332, "minX": 1.52081082E12, "maxY": 64518.41666666667, "series": [{"data": [[1.52081088E12, 64518.41666666667], [1.52081112E12, 62242.0], [1.52081082E12, 58329.70833333332], [1.52081118E12, 64117.98305084746]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52081118E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 7.333333333333333, "minX": 1.52081082E12, "maxY": 10.0, "series": [{"data": [[1.52081088E12, 7.333333333333333], [1.52081112E12, 10.0], [1.52081082E12, 9.645833333333332], [1.52081118E12, 8.35593220338983]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52081118E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 306341.0, "minX": 1.52081082E12, "maxY": 348386.0, "series": [{"data": [[1.52081088E12, 342028.0], [1.52081112E12, 328555.0], [1.52081082E12, 334418.0], [1.52081118E12, 348386.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52081088E12, 333437.0], [1.52081112E12, 328555.0], [1.52081082E12, 306341.0], [1.52081118E12, 322953.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52081088E12, 335994.3], [1.52081112E12, 335906.6], [1.52081082E12, 332176.3], [1.52081118E12, 339479.3]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52081088E12, 342028.0], [1.52081112E12, 342028.0], [1.52081082E12, 334418.0], [1.52081118E12, 347050.81999999995]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52081088E12, 336328.05], [1.52081112E12, 336319.1], [1.52081082E12, 334190.0], [1.52081118E12, 340486.05]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081118E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 331778.0, "minX": 0.0, "maxY": 331778.0, "series": [{"data": [[0.0, 331778.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 63133.5, "minX": 0.0, "maxY": 63133.5, "series": [{"data": [[0.0, 63133.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 0.2, "minX": 1.52081052E12, "maxY": 1.0, "series": [{"data": [[1.52081088E12, 0.2], [1.52081082E12, 0.8], [1.52081052E12, 1.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081088E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52081082E12, "maxY": 0.9833333333333333, "series": [{"data": [[1.52081088E12, 0.2], [1.52081112E12, 0.016666666666666666], [1.52081082E12, 0.8], [1.52081118E12, 0.9833333333333333]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081118E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52081082E12, "maxY": 0.9833333333333333, "series": [{"data": [[1.52081088E12, 0.2], [1.52081112E12, 0.016666666666666666], [1.52081082E12, 0.8], [1.52081118E12, 0.9833333333333333]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52081118E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
