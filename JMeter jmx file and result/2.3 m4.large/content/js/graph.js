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
        data: {"result": {"minY": 245172.0, "minX": 0.0, "maxY": 284472.0, "series": [{"data": [[0.0, 245172.0], [0.1, 245172.0], [0.2, 245172.0], [0.3, 245172.0], [0.4, 245172.0], [0.5, 245172.0], [0.6, 245172.0], [0.7, 245172.0], [0.8, 245172.0], [0.9, 249987.0], [1.0, 249987.0], [1.1, 249987.0], [1.2, 249987.0], [1.3, 249987.0], [1.4, 249987.0], [1.5, 249987.0], [1.6, 249987.0], [1.7, 250379.0], [1.8, 250379.0], [1.9, 250379.0], [2.0, 250379.0], [2.1, 250379.0], [2.2, 250379.0], [2.3, 250379.0], [2.4, 250379.0], [2.5, 254099.0], [2.6, 254099.0], [2.7, 254099.0], [2.8, 254099.0], [2.9, 254099.0], [3.0, 254099.0], [3.1, 254099.0], [3.2, 254099.0], [3.3, 254099.0], [3.4, 254180.0], [3.5, 254180.0], [3.6, 254180.0], [3.7, 254180.0], [3.8, 254180.0], [3.9, 254180.0], [4.0, 254180.0], [4.1, 254180.0], [4.2, 256549.0], [4.3, 256549.0], [4.4, 256549.0], [4.5, 256549.0], [4.6, 256549.0], [4.7, 256549.0], [4.8, 256549.0], [4.9, 256549.0], [5.0, 258011.0], [5.1, 258011.0], [5.2, 258011.0], [5.3, 258011.0], [5.4, 258011.0], [5.5, 258011.0], [5.6, 258011.0], [5.7, 258011.0], [5.8, 258011.0], [5.9, 258770.0], [6.0, 258770.0], [6.1, 258770.0], [6.2, 258770.0], [6.3, 258770.0], [6.4, 258770.0], [6.5, 258770.0], [6.6, 258770.0], [6.7, 259279.0], [6.8, 259279.0], [6.9, 259279.0], [7.0, 259279.0], [7.1, 259279.0], [7.2, 259279.0], [7.3, 259279.0], [7.4, 259279.0], [7.5, 259308.0], [7.6, 259308.0], [7.7, 259308.0], [7.8, 259308.0], [7.9, 259308.0], [8.0, 259308.0], [8.1, 259308.0], [8.2, 259308.0], [8.3, 259308.0], [8.4, 259584.0], [8.5, 259584.0], [8.6, 259584.0], [8.7, 259584.0], [8.8, 259584.0], [8.9, 259584.0], [9.0, 259584.0], [9.1, 259584.0], [9.2, 260613.0], [9.3, 260613.0], [9.4, 260613.0], [9.5, 260613.0], [9.6, 260613.0], [9.7, 260613.0], [9.8, 260613.0], [9.9, 260613.0], [10.0, 260775.0], [10.1, 260775.0], [10.2, 260775.0], [10.3, 260775.0], [10.4, 260775.0], [10.5, 260775.0], [10.6, 260775.0], [10.7, 260775.0], [10.8, 260775.0], [10.9, 260988.0], [11.0, 260988.0], [11.1, 260988.0], [11.2, 260988.0], [11.3, 260988.0], [11.4, 260988.0], [11.5, 260988.0], [11.6, 260988.0], [11.7, 261162.0], [11.8, 261162.0], [11.9, 261162.0], [12.0, 261162.0], [12.1, 261162.0], [12.2, 261162.0], [12.3, 261162.0], [12.4, 261162.0], [12.5, 261162.0], [12.6, 261614.0], [12.7, 261614.0], [12.8, 261614.0], [12.9, 261614.0], [13.0, 261614.0], [13.1, 261614.0], [13.2, 261614.0], [13.3, 261614.0], [13.4, 261825.0], [13.5, 261825.0], [13.6, 261825.0], [13.7, 261825.0], [13.8, 261825.0], [13.9, 261825.0], [14.0, 261825.0], [14.1, 261825.0], [14.2, 262003.0], [14.3, 262003.0], [14.4, 262003.0], [14.5, 262003.0], [14.6, 262003.0], [14.7, 262003.0], [14.8, 262003.0], [14.9, 262003.0], [15.0, 262003.0], [15.1, 262123.0], [15.2, 262123.0], [15.3, 262123.0], [15.4, 262123.0], [15.5, 262123.0], [15.6, 262123.0], [15.7, 262123.0], [15.8, 262123.0], [15.9, 262221.0], [16.0, 262221.0], [16.1, 262221.0], [16.2, 262221.0], [16.3, 262221.0], [16.4, 262221.0], [16.5, 262221.0], [16.6, 262221.0], [16.7, 262259.0], [16.8, 262259.0], [16.9, 262259.0], [17.0, 262259.0], [17.1, 262259.0], [17.2, 262259.0], [17.3, 262259.0], [17.4, 262259.0], [17.5, 262259.0], [17.6, 262493.0], [17.7, 262493.0], [17.8, 262493.0], [17.9, 262493.0], [18.0, 262493.0], [18.1, 262493.0], [18.2, 262493.0], [18.3, 262493.0], [18.4, 262640.0], [18.5, 262640.0], [18.6, 262640.0], [18.7, 262640.0], [18.8, 262640.0], [18.9, 262640.0], [19.0, 262640.0], [19.1, 262640.0], [19.2, 262705.0], [19.3, 262705.0], [19.4, 262705.0], [19.5, 262705.0], [19.6, 262705.0], [19.7, 262705.0], [19.8, 262705.0], [19.9, 262705.0], [20.0, 262787.0], [20.1, 262787.0], [20.2, 262787.0], [20.3, 262787.0], [20.4, 262787.0], [20.5, 262787.0], [20.6, 262787.0], [20.7, 262787.0], [20.8, 262787.0], [20.9, 262946.0], [21.0, 262946.0], [21.1, 262946.0], [21.2, 262946.0], [21.3, 262946.0], [21.4, 262946.0], [21.5, 262946.0], [21.6, 262946.0], [21.7, 263279.0], [21.8, 263279.0], [21.9, 263279.0], [22.0, 263279.0], [22.1, 263279.0], [22.2, 263279.0], [22.3, 263279.0], [22.4, 263279.0], [22.5, 263298.0], [22.6, 263298.0], [22.7, 263298.0], [22.8, 263298.0], [22.9, 263298.0], [23.0, 263298.0], [23.1, 263298.0], [23.2, 263298.0], [23.3, 263298.0], [23.4, 263541.0], [23.5, 263541.0], [23.6, 263541.0], [23.7, 263541.0], [23.8, 263541.0], [23.9, 263541.0], [24.0, 263541.0], [24.1, 263541.0], [24.2, 263557.0], [24.3, 263557.0], [24.4, 263557.0], [24.5, 263557.0], [24.6, 263557.0], [24.7, 263557.0], [24.8, 263557.0], [24.9, 263557.0], [25.0, 263623.0], [25.1, 263623.0], [25.2, 263623.0], [25.3, 263623.0], [25.4, 263623.0], [25.5, 263623.0], [25.6, 263623.0], [25.7, 263623.0], [25.8, 263623.0], [25.9, 263728.0], [26.0, 263728.0], [26.1, 263728.0], [26.2, 263728.0], [26.3, 263728.0], [26.4, 263728.0], [26.5, 263728.0], [26.6, 263728.0], [26.7, 263761.0], [26.8, 263761.0], [26.9, 263761.0], [27.0, 263761.0], [27.1, 263761.0], [27.2, 263761.0], [27.3, 263761.0], [27.4, 263761.0], [27.5, 263815.0], [27.6, 263815.0], [27.7, 263815.0], [27.8, 263815.0], [27.9, 263815.0], [28.0, 263815.0], [28.1, 263815.0], [28.2, 263815.0], [28.3, 263815.0], [28.4, 263845.0], [28.5, 263845.0], [28.6, 263845.0], [28.7, 263845.0], [28.8, 263845.0], [28.9, 263845.0], [29.0, 263845.0], [29.1, 263845.0], [29.2, 264062.0], [29.3, 264062.0], [29.4, 264062.0], [29.5, 264062.0], [29.6, 264062.0], [29.7, 264062.0], [29.8, 264062.0], [29.9, 264062.0], [30.0, 264077.0], [30.1, 264077.0], [30.2, 264077.0], [30.3, 264077.0], [30.4, 264077.0], [30.5, 264077.0], [30.6, 264077.0], [30.7, 264077.0], [30.8, 264077.0], [30.9, 264192.0], [31.0, 264192.0], [31.1, 264192.0], [31.2, 264192.0], [31.3, 264192.0], [31.4, 264192.0], [31.5, 264192.0], [31.6, 264192.0], [31.7, 264234.0], [31.8, 264234.0], [31.9, 264234.0], [32.0, 264234.0], [32.1, 264234.0], [32.2, 264234.0], [32.3, 264234.0], [32.4, 264234.0], [32.5, 264256.0], [32.6, 264256.0], [32.7, 264256.0], [32.8, 264256.0], [32.9, 264256.0], [33.0, 264256.0], [33.1, 264256.0], [33.2, 264256.0], [33.3, 264256.0], [33.4, 264316.0], [33.5, 264316.0], [33.6, 264316.0], [33.7, 264316.0], [33.8, 264316.0], [33.9, 264316.0], [34.0, 264316.0], [34.1, 264316.0], [34.2, 264372.0], [34.3, 264372.0], [34.4, 264372.0], [34.5, 264372.0], [34.6, 264372.0], [34.7, 264372.0], [34.8, 264372.0], [34.9, 264372.0], [35.0, 264734.0], [35.1, 264734.0], [35.2, 264734.0], [35.3, 264734.0], [35.4, 264734.0], [35.5, 264734.0], [35.6, 264734.0], [35.7, 264734.0], [35.8, 264734.0], [35.9, 264898.0], [36.0, 264898.0], [36.1, 264898.0], [36.2, 264898.0], [36.3, 264898.0], [36.4, 264898.0], [36.5, 264898.0], [36.6, 264898.0], [36.7, 264905.0], [36.8, 264905.0], [36.9, 264905.0], [37.0, 264905.0], [37.1, 264905.0], [37.2, 264905.0], [37.3, 264905.0], [37.4, 264905.0], [37.5, 265228.0], [37.6, 265228.0], [37.7, 265228.0], [37.8, 265228.0], [37.9, 265228.0], [38.0, 265228.0], [38.1, 265228.0], [38.2, 265228.0], [38.3, 265228.0], [38.4, 265313.0], [38.5, 265313.0], [38.6, 265313.0], [38.7, 265313.0], [38.8, 265313.0], [38.9, 265313.0], [39.0, 265313.0], [39.1, 265313.0], [39.2, 265396.0], [39.3, 265396.0], [39.4, 265396.0], [39.5, 265396.0], [39.6, 265396.0], [39.7, 265396.0], [39.8, 265396.0], [39.9, 265396.0], [40.0, 265396.0], [40.1, 265493.0], [40.2, 265493.0], [40.3, 265493.0], [40.4, 265493.0], [40.5, 265493.0], [40.6, 265493.0], [40.7, 265493.0], [40.8, 265493.0], [40.9, 265548.0], [41.0, 265548.0], [41.1, 265548.0], [41.2, 265548.0], [41.3, 265548.0], [41.4, 265548.0], [41.5, 265548.0], [41.6, 265548.0], [41.7, 265588.0], [41.8, 265588.0], [41.9, 265588.0], [42.0, 265588.0], [42.1, 265588.0], [42.2, 265588.0], [42.3, 265588.0], [42.4, 265588.0], [42.5, 265588.0], [42.6, 265741.0], [42.7, 265741.0], [42.8, 265741.0], [42.9, 265741.0], [43.0, 265741.0], [43.1, 265741.0], [43.2, 265741.0], [43.3, 265741.0], [43.4, 265816.0], [43.5, 265816.0], [43.6, 265816.0], [43.7, 265816.0], [43.8, 265816.0], [43.9, 265816.0], [44.0, 265816.0], [44.1, 265816.0], [44.2, 265913.0], [44.3, 265913.0], [44.4, 265913.0], [44.5, 265913.0], [44.6, 265913.0], [44.7, 265913.0], [44.8, 265913.0], [44.9, 265913.0], [45.0, 265913.0], [45.1, 265958.0], [45.2, 265958.0], [45.3, 265958.0], [45.4, 265958.0], [45.5, 265958.0], [45.6, 265958.0], [45.7, 265958.0], [45.8, 265958.0], [45.9, 266089.0], [46.0, 266089.0], [46.1, 266089.0], [46.2, 266089.0], [46.3, 266089.0], [46.4, 266089.0], [46.5, 266089.0], [46.6, 266089.0], [46.7, 266414.0], [46.8, 266414.0], [46.9, 266414.0], [47.0, 266414.0], [47.1, 266414.0], [47.2, 266414.0], [47.3, 266414.0], [47.4, 266414.0], [47.5, 266414.0], [47.6, 266438.0], [47.7, 266438.0], [47.8, 266438.0], [47.9, 266438.0], [48.0, 266438.0], [48.1, 266438.0], [48.2, 266438.0], [48.3, 266438.0], [48.4, 266706.0], [48.5, 266706.0], [48.6, 266706.0], [48.7, 266706.0], [48.8, 266706.0], [48.9, 266706.0], [49.0, 266706.0], [49.1, 266706.0], [49.2, 266755.0], [49.3, 266755.0], [49.4, 266755.0], [49.5, 266755.0], [49.6, 266755.0], [49.7, 266755.0], [49.8, 266755.0], [49.9, 266755.0], [50.0, 266755.0], [50.1, 266912.0], [50.2, 266912.0], [50.3, 266912.0], [50.4, 266912.0], [50.5, 266912.0], [50.6, 266912.0], [50.7, 266912.0], [50.8, 266912.0], [50.9, 266991.0], [51.0, 266991.0], [51.1, 266991.0], [51.2, 266991.0], [51.3, 266991.0], [51.4, 266991.0], [51.5, 266991.0], [51.6, 266991.0], [51.7, 267340.0], [51.8, 267340.0], [51.9, 267340.0], [52.0, 267340.0], [52.1, 267340.0], [52.2, 267340.0], [52.3, 267340.0], [52.4, 267340.0], [52.5, 267340.0], [52.6, 267757.0], [52.7, 267757.0], [52.8, 267757.0], [52.9, 267757.0], [53.0, 267757.0], [53.1, 267757.0], [53.2, 267757.0], [53.3, 267757.0], [53.4, 267772.0], [53.5, 267772.0], [53.6, 267772.0], [53.7, 267772.0], [53.8, 267772.0], [53.9, 267772.0], [54.0, 267772.0], [54.1, 267772.0], [54.2, 267802.0], [54.3, 267802.0], [54.4, 267802.0], [54.5, 267802.0], [54.6, 267802.0], [54.7, 267802.0], [54.8, 267802.0], [54.9, 267802.0], [55.0, 267802.0], [55.1, 267827.0], [55.2, 267827.0], [55.3, 267827.0], [55.4, 267827.0], [55.5, 267827.0], [55.6, 267827.0], [55.7, 267827.0], [55.8, 267827.0], [55.9, 267967.0], [56.0, 267967.0], [56.1, 267967.0], [56.2, 267967.0], [56.3, 267967.0], [56.4, 267967.0], [56.5, 267967.0], [56.6, 267967.0], [56.7, 267974.0], [56.8, 267974.0], [56.9, 267974.0], [57.0, 267974.0], [57.1, 267974.0], [57.2, 267974.0], [57.3, 267974.0], [57.4, 267974.0], [57.5, 267974.0], [57.6, 268076.0], [57.7, 268076.0], [57.8, 268076.0], [57.9, 268076.0], [58.0, 268076.0], [58.1, 268076.0], [58.2, 268076.0], [58.3, 268076.0], [58.4, 268165.0], [58.5, 268165.0], [58.6, 268165.0], [58.7, 268165.0], [58.8, 268165.0], [58.9, 268165.0], [59.0, 268165.0], [59.1, 268165.0], [59.2, 268329.0], [59.3, 268329.0], [59.4, 268329.0], [59.5, 268329.0], [59.6, 268329.0], [59.7, 268329.0], [59.8, 268329.0], [59.9, 268329.0], [60.0, 268329.0], [60.1, 268454.0], [60.2, 268454.0], [60.3, 268454.0], [60.4, 268454.0], [60.5, 268454.0], [60.6, 268454.0], [60.7, 268454.0], [60.8, 268454.0], [60.9, 268520.0], [61.0, 268520.0], [61.1, 268520.0], [61.2, 268520.0], [61.3, 268520.0], [61.4, 268520.0], [61.5, 268520.0], [61.6, 268520.0], [61.7, 268526.0], [61.8, 268526.0], [61.9, 268526.0], [62.0, 268526.0], [62.1, 268526.0], [62.2, 268526.0], [62.3, 268526.0], [62.4, 268526.0], [62.5, 268526.0], [62.6, 268768.0], [62.7, 268768.0], [62.8, 268768.0], [62.9, 268768.0], [63.0, 268768.0], [63.1, 268768.0], [63.2, 268768.0], [63.3, 268768.0], [63.4, 268856.0], [63.5, 268856.0], [63.6, 268856.0], [63.7, 268856.0], [63.8, 268856.0], [63.9, 268856.0], [64.0, 268856.0], [64.1, 268856.0], [64.2, 268883.0], [64.3, 268883.0], [64.4, 268883.0], [64.5, 268883.0], [64.6, 268883.0], [64.7, 268883.0], [64.8, 268883.0], [64.9, 268883.0], [65.0, 268883.0], [65.1, 268921.0], [65.2, 268921.0], [65.3, 268921.0], [65.4, 268921.0], [65.5, 268921.0], [65.6, 268921.0], [65.7, 268921.0], [65.8, 268921.0], [65.9, 268946.0], [66.0, 268946.0], [66.1, 268946.0], [66.2, 268946.0], [66.3, 268946.0], [66.4, 268946.0], [66.5, 268946.0], [66.6, 268946.0], [66.7, 269047.0], [66.8, 269047.0], [66.9, 269047.0], [67.0, 269047.0], [67.1, 269047.0], [67.2, 269047.0], [67.3, 269047.0], [67.4, 269047.0], [67.5, 269047.0], [67.6, 269097.0], [67.7, 269097.0], [67.8, 269097.0], [67.9, 269097.0], [68.0, 269097.0], [68.1, 269097.0], [68.2, 269097.0], [68.3, 269097.0], [68.4, 269193.0], [68.5, 269193.0], [68.6, 269193.0], [68.7, 269193.0], [68.8, 269193.0], [68.9, 269193.0], [69.0, 269193.0], [69.1, 269193.0], [69.2, 269232.0], [69.3, 269232.0], [69.4, 269232.0], [69.5, 269232.0], [69.6, 269232.0], [69.7, 269232.0], [69.8, 269232.0], [69.9, 269232.0], [70.0, 269232.0], [70.1, 269268.0], [70.2, 269268.0], [70.3, 269268.0], [70.4, 269268.0], [70.5, 269268.0], [70.6, 269268.0], [70.7, 269268.0], [70.8, 269268.0], [70.9, 269331.0], [71.0, 269331.0], [71.1, 269331.0], [71.2, 269331.0], [71.3, 269331.0], [71.4, 269331.0], [71.5, 269331.0], [71.6, 269331.0], [71.7, 269384.0], [71.8, 269384.0], [71.9, 269384.0], [72.0, 269384.0], [72.1, 269384.0], [72.2, 269384.0], [72.3, 269384.0], [72.4, 269384.0], [72.5, 269384.0], [72.6, 269387.0], [72.7, 269387.0], [72.8, 269387.0], [72.9, 269387.0], [73.0, 269387.0], [73.1, 269387.0], [73.2, 269387.0], [73.3, 269387.0], [73.4, 269727.0], [73.5, 269727.0], [73.6, 269727.0], [73.7, 269727.0], [73.8, 269727.0], [73.9, 269727.0], [74.0, 269727.0], [74.1, 269727.0], [74.2, 269795.0], [74.3, 269795.0], [74.4, 269795.0], [74.5, 269795.0], [74.6, 269795.0], [74.7, 269795.0], [74.8, 269795.0], [74.9, 269795.0], [75.0, 269795.0], [75.1, 269869.0], [75.2, 269869.0], [75.3, 269869.0], [75.4, 269869.0], [75.5, 269869.0], [75.6, 269869.0], [75.7, 269869.0], [75.8, 269869.0], [75.9, 269983.0], [76.0, 269983.0], [76.1, 269983.0], [76.2, 269983.0], [76.3, 269983.0], [76.4, 269983.0], [76.5, 269983.0], [76.6, 269983.0], [76.7, 270268.0], [76.8, 270268.0], [76.9, 270268.0], [77.0, 270268.0], [77.1, 270268.0], [77.2, 270268.0], [77.3, 270268.0], [77.4, 270268.0], [77.5, 270323.0], [77.6, 270323.0], [77.7, 270323.0], [77.8, 270323.0], [77.9, 270323.0], [78.0, 270323.0], [78.1, 270323.0], [78.2, 270323.0], [78.3, 270323.0], [78.4, 270418.0], [78.5, 270418.0], [78.6, 270418.0], [78.7, 270418.0], [78.8, 270418.0], [78.9, 270418.0], [79.0, 270418.0], [79.1, 270418.0], [79.2, 270442.0], [79.3, 270442.0], [79.4, 270442.0], [79.5, 270442.0], [79.6, 270442.0], [79.7, 270442.0], [79.8, 270442.0], [79.9, 270442.0], [80.0, 270480.0], [80.1, 270480.0], [80.2, 270480.0], [80.3, 270480.0], [80.4, 270480.0], [80.5, 270480.0], [80.6, 270480.0], [80.7, 270480.0], [80.8, 270480.0], [80.9, 270860.0], [81.0, 270860.0], [81.1, 270860.0], [81.2, 270860.0], [81.3, 270860.0], [81.4, 270860.0], [81.5, 270860.0], [81.6, 270860.0], [81.7, 270951.0], [81.8, 270951.0], [81.9, 270951.0], [82.0, 270951.0], [82.1, 270951.0], [82.2, 270951.0], [82.3, 270951.0], [82.4, 270951.0], [82.5, 271017.0], [82.6, 271017.0], [82.7, 271017.0], [82.8, 271017.0], [82.9, 271017.0], [83.0, 271017.0], [83.1, 271017.0], [83.2, 271017.0], [83.3, 271017.0], [83.4, 271558.0], [83.5, 271558.0], [83.6, 271558.0], [83.7, 271558.0], [83.8, 271558.0], [83.9, 271558.0], [84.0, 271558.0], [84.1, 271558.0], [84.2, 271787.0], [84.3, 271787.0], [84.4, 271787.0], [84.5, 271787.0], [84.6, 271787.0], [84.7, 271787.0], [84.8, 271787.0], [84.9, 271787.0], [85.0, 271796.0], [85.1, 271796.0], [85.2, 271796.0], [85.3, 271796.0], [85.4, 271796.0], [85.5, 271796.0], [85.6, 271796.0], [85.7, 271796.0], [85.8, 271796.0], [85.9, 271975.0], [86.0, 271975.0], [86.1, 271975.0], [86.2, 271975.0], [86.3, 271975.0], [86.4, 271975.0], [86.5, 271975.0], [86.6, 271975.0], [86.7, 272099.0], [86.8, 272099.0], [86.9, 272099.0], [87.0, 272099.0], [87.1, 272099.0], [87.2, 272099.0], [87.3, 272099.0], [87.4, 272099.0], [87.5, 272447.0], [87.6, 272447.0], [87.7, 272447.0], [87.8, 272447.0], [87.9, 272447.0], [88.0, 272447.0], [88.1, 272447.0], [88.2, 272447.0], [88.3, 272447.0], [88.4, 272684.0], [88.5, 272684.0], [88.6, 272684.0], [88.7, 272684.0], [88.8, 272684.0], [88.9, 272684.0], [89.0, 272684.0], [89.1, 272684.0], [89.2, 272769.0], [89.3, 272769.0], [89.4, 272769.0], [89.5, 272769.0], [89.6, 272769.0], [89.7, 272769.0], [89.8, 272769.0], [89.9, 272769.0], [90.0, 272776.0], [90.1, 272776.0], [90.2, 272776.0], [90.3, 272776.0], [90.4, 272776.0], [90.5, 272776.0], [90.6, 272776.0], [90.7, 272776.0], [90.8, 272776.0], [90.9, 272890.0], [91.0, 272890.0], [91.1, 272890.0], [91.2, 272890.0], [91.3, 272890.0], [91.4, 272890.0], [91.5, 272890.0], [91.6, 272890.0], [91.7, 273147.0], [91.8, 273147.0], [91.9, 273147.0], [92.0, 273147.0], [92.1, 273147.0], [92.2, 273147.0], [92.3, 273147.0], [92.4, 273147.0], [92.5, 273346.0], [92.6, 273346.0], [92.7, 273346.0], [92.8, 273346.0], [92.9, 273346.0], [93.0, 273346.0], [93.1, 273346.0], [93.2, 273346.0], [93.3, 273346.0], [93.4, 274065.0], [93.5, 274065.0], [93.6, 274065.0], [93.7, 274065.0], [93.8, 274065.0], [93.9, 274065.0], [94.0, 274065.0], [94.1, 274065.0], [94.2, 274638.0], [94.3, 274638.0], [94.4, 274638.0], [94.5, 274638.0], [94.6, 274638.0], [94.7, 274638.0], [94.8, 274638.0], [94.9, 274638.0], [95.0, 275462.0], [95.1, 275462.0], [95.2, 275462.0], [95.3, 275462.0], [95.4, 275462.0], [95.5, 275462.0], [95.6, 275462.0], [95.7, 275462.0], [95.8, 275462.0], [95.9, 276421.0], [96.0, 276421.0], [96.1, 276421.0], [96.2, 276421.0], [96.3, 276421.0], [96.4, 276421.0], [96.5, 276421.0], [96.6, 276421.0], [96.7, 277643.0], [96.8, 277643.0], [96.9, 277643.0], [97.0, 277643.0], [97.1, 277643.0], [97.2, 277643.0], [97.3, 277643.0], [97.4, 277643.0], [97.5, 281882.0], [97.6, 281882.0], [97.7, 281882.0], [97.8, 281882.0], [97.9, 281882.0], [98.0, 281882.0], [98.1, 281882.0], [98.2, 281882.0], [98.3, 281882.0], [98.4, 282154.0], [98.5, 282154.0], [98.6, 282154.0], [98.7, 282154.0], [98.8, 282154.0], [98.9, 282154.0], [99.0, 282154.0], [99.1, 282154.0], [99.2, 284472.0], [99.3, 284472.0], [99.4, 284472.0], [99.5, 284472.0], [99.6, 284472.0], [99.7, 284472.0], [99.8, 284472.0], [99.9, 284472.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 245100.0, "maxY": 3.0, "series": [{"data": [[268900.0, 2.0], [269700.0, 2.0], [268100.0, 1.0], [265700.0, 1.0], [264900.0, 1.0], [264100.0, 1.0], [267300.0, 1.0], [254000.0, 1.0], [258000.0, 1.0], [259200.0, 1.0], [262000.0, 1.0], [261600.0, 1.0], [263200.0, 2.0], [268800.0, 2.0], [270400.0, 3.0], [272000.0, 1.0], [266400.0, 2.0], [268000.0, 1.0], [264800.0, 1.0], [264000.0, 2.0], [272800.0, 1.0], [262400.0, 1.0], [277600.0, 1.0], [264300.0, 2.0], [269900.0, 1.0], [273100.0, 1.0], [269100.0, 1.0], [268300.0, 1.0], [266700.0, 2.0], [271500.0, 1.0], [262700.0, 2.0], [263500.0, 2.0], [265900.0, 2.0], [254100.0, 1.0], [256500.0, 1.0], [262100.0, 1.0], [260900.0, 1.0], [259300.0, 1.0], [264200.0, 2.0], [269000.0, 2.0], [274600.0, 1.0], [275400.0, 1.0], [265800.0, 1.0], [269800.0, 1.0], [262600.0, 1.0], [281800.0, 1.0], [263700.0, 2.0], [266900.0, 2.0], [265300.0, 2.0], [270900.0, 1.0], [271700.0, 2.0], [273300.0, 1.0], [268500.0, 2.0], [267700.0, 2.0], [269300.0, 3.0], [262900.0, 1.0], [282100.0, 1.0], [261800.0, 1.0], [260600.0, 1.0], [266000.0, 1.0], [268400.0, 1.0], [269200.0, 2.0], [270800.0, 1.0], [274000.0, 1.0], [272400.0, 1.0], [276400.0, 1.0], [265200.0, 1.0], [263600.0, 1.0], [284400.0, 1.0], [264700.0, 1.0], [265500.0, 2.0], [272700.0, 2.0], [267900.0, 2.0], [268700.0, 1.0], [270300.0, 1.0], [271900.0, 1.0], [245100.0, 1.0], [250300.0, 1.0], [249900.0, 1.0], [259500.0, 1.0], [260700.0, 1.0], [261100.0, 1.0], [258700.0, 1.0], [262200.0, 2.0], [265400.0, 1.0], [267800.0, 2.0], [270200.0, 1.0], [272600.0, 1.0], [271000.0, 1.0], [263800.0, 2.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 284400.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 18.0, "minX": 1.520808E12, "maxY": 60.0, "series": [{"data": [[1.520808E12, 60.0], [1.5208083E12, 18.0], [1.52080824E12, 48.080000000000005]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5208083E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 258770.0, "minX": 1.0, "maxY": 284472.0, "series": [{"data": [[2.0, 259308.0], [3.0, 263541.0], [4.0, 262946.0], [5.0, 261162.0], [6.0, 262640.0], [7.0, 263815.0], [8.0, 263623.0], [9.0, 260613.0], [10.0, 264062.0], [11.0, 267340.0], [12.0, 263557.0], [13.0, 263761.0], [14.0, 264316.0], [15.0, 263845.0], [16.0, 264372.0], [17.0, 264077.0], [18.0, 261614.0], [19.0, 260988.0], [20.0, 265313.0], [21.0, 265228.0], [22.0, 264192.0], [23.0, 264256.0], [24.0, 262123.0], [25.0, 268076.0], [26.0, 265913.0], [27.0, 262705.0], [28.0, 266755.0], [29.0, 269869.0], [30.0, 281882.0], [31.0, 265816.0], [33.0, 276421.0], [32.0, 264905.0], [35.0, 262259.0], [34.0, 265958.0], [37.0, 265548.0], [36.0, 266414.0], [39.0, 265741.0], [38.0, 268856.0], [41.0, 277643.0], [40.0, 268526.0], [43.0, 275462.0], [42.0, 269387.0], [45.0, 263279.0], [44.0, 269727.0], [46.0, 262787.0], [49.0, 267974.0], [48.0, 268704.5], [51.0, 262493.0], [50.0, 272447.0], [53.0, 272890.0], [52.0, 267757.0], [55.0, 264898.0], [54.0, 282154.0], [57.0, 271558.0], [56.0, 284472.0], [58.0, 270951.0], [60.0, 266481.22580645164], [1.0, 258770.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[45.266666666666666, 266635.2499999999]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 60.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 67.5, "minX": 1.520808E12, "maxY": 43293.0, "series": [{"data": [[1.520808E12, 43293.0], [1.5208083E12, 25254.25], [1.52080824E12, 18038.75]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.520808E12, 162.0], [1.5208083E12, 94.5], [1.52080824E12, 67.5]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5208083E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 264743.4571428572, "minX": 1.520808E12, "maxY": 269871.44, "series": [{"data": [[1.520808E12, 266390.38333333336], [1.5208083E12, 264743.4571428572], [1.52080824E12, 269871.44]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5208083E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 47915.85000000002, "minX": 1.520808E12, "maxY": 52453.6, "series": [{"data": [[1.520808E12, 47915.85000000002], [1.5208083E12, 52452.314285714296], [1.52080824E12, 52453.6]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5208083E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 12.685714285714283, "minX": 1.520808E12, "maxY": 13.080000000000002, "series": [{"data": [[1.520808E12, 12.866666666666669], [1.5208083E12, 12.685714285714283], [1.52080824E12, 13.080000000000002]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5208083E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 245172.0, "minX": 1.520808E12, "maxY": 284472.0, "series": [{"data": [[1.520808E12, 274638.0], [1.5208083E12, 281882.0], [1.52080824E12, 284472.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.520808E12, 245172.0], [1.5208083E12, 258770.0], [1.52080824E12, 262493.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.520808E12, 272760.5], [1.5208083E12, 272775.3], [1.52080824E12, 272992.8]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.520808E12, 274638.0], [1.5208083E12, 283985.22], [1.52080824E12, 284472.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.520808E12, 273336.05], [1.5208083E12, 275420.8], [1.52080824E12, 275214.8]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5208083E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 265430.5, "minX": 0.0, "maxY": 268487.0, "series": [{"data": [[1.0, 268487.0], [0.0, 265430.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 50770.5, "minX": 0.0, "maxY": 52514.0, "series": [{"data": [[1.0, 50770.5], [0.0, 52514.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.52080776E12, "maxY": 1.0, "series": [{"data": [[1.520808E12, 1.0], [1.52080776E12, 1.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.520808E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.4166666666666667, "minX": 1.520808E12, "maxY": 1.0, "series": [{"data": [[1.520808E12, 1.0], [1.5208083E12, 0.5833333333333334], [1.52080824E12, 0.4166666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5208083E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.4166666666666667, "minX": 1.520808E12, "maxY": 1.0, "series": [{"data": [[1.520808E12, 1.0], [1.5208083E12, 0.5833333333333334], [1.52080824E12, 0.4166666666666667]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5208083E12, "title": "Transactions Per Second"}},
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
