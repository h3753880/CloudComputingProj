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
        var xOffset = options.xaxis.mode === "time" ? -28800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? -28800000 : 0;

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
        data: {"result": {"minY": 234031.0, "minX": 0.0, "maxY": 275581.0, "series": [{"data": [[0.0, 234031.0], [0.1, 234031.0], [0.2, 234031.0], [0.3, 234031.0], [0.4, 234031.0], [0.5, 234031.0], [0.6, 234031.0], [0.7, 234031.0], [0.8, 234031.0], [0.9, 238736.0], [1.0, 238736.0], [1.1, 238736.0], [1.2, 238736.0], [1.3, 238736.0], [1.4, 238736.0], [1.5, 238736.0], [1.6, 238736.0], [1.7, 240926.0], [1.8, 240926.0], [1.9, 240926.0], [2.0, 240926.0], [2.1, 240926.0], [2.2, 240926.0], [2.3, 240926.0], [2.4, 240926.0], [2.5, 241253.0], [2.6, 241253.0], [2.7, 241253.0], [2.8, 241253.0], [2.9, 241253.0], [3.0, 241253.0], [3.1, 241253.0], [3.2, 241253.0], [3.3, 241253.0], [3.4, 254213.0], [3.5, 254213.0], [3.6, 254213.0], [3.7, 254213.0], [3.8, 254213.0], [3.9, 254213.0], [4.0, 254213.0], [4.1, 254213.0], [4.2, 254709.0], [4.3, 254709.0], [4.4, 254709.0], [4.5, 254709.0], [4.6, 254709.0], [4.7, 254709.0], [4.8, 254709.0], [4.9, 254709.0], [5.0, 255808.0], [5.1, 255808.0], [5.2, 255808.0], [5.3, 255808.0], [5.4, 255808.0], [5.5, 255808.0], [5.6, 255808.0], [5.7, 255808.0], [5.8, 255808.0], [5.9, 256009.0], [6.0, 256009.0], [6.1, 256009.0], [6.2, 256009.0], [6.3, 256009.0], [6.4, 256009.0], [6.5, 256009.0], [6.6, 256009.0], [6.7, 256461.0], [6.8, 256461.0], [6.9, 256461.0], [7.0, 256461.0], [7.1, 256461.0], [7.2, 256461.0], [7.3, 256461.0], [7.4, 256461.0], [7.5, 256685.0], [7.6, 256685.0], [7.7, 256685.0], [7.8, 256685.0], [7.9, 256685.0], [8.0, 256685.0], [8.1, 256685.0], [8.2, 256685.0], [8.3, 256685.0], [8.4, 257327.0], [8.5, 257327.0], [8.6, 257327.0], [8.7, 257327.0], [8.8, 257327.0], [8.9, 257327.0], [9.0, 257327.0], [9.1, 257327.0], [9.2, 257339.0], [9.3, 257339.0], [9.4, 257339.0], [9.5, 257339.0], [9.6, 257339.0], [9.7, 257339.0], [9.8, 257339.0], [9.9, 257339.0], [10.0, 257411.0], [10.1, 257411.0], [10.2, 257411.0], [10.3, 257411.0], [10.4, 257411.0], [10.5, 257411.0], [10.6, 257411.0], [10.7, 257411.0], [10.8, 257411.0], [10.9, 257443.0], [11.0, 257443.0], [11.1, 257443.0], [11.2, 257443.0], [11.3, 257443.0], [11.4, 257443.0], [11.5, 257443.0], [11.6, 257443.0], [11.7, 257565.0], [11.8, 257565.0], [11.9, 257565.0], [12.0, 257565.0], [12.1, 257565.0], [12.2, 257565.0], [12.3, 257565.0], [12.4, 257565.0], [12.5, 257565.0], [12.6, 257757.0], [12.7, 257757.0], [12.8, 257757.0], [12.9, 257757.0], [13.0, 257757.0], [13.1, 257757.0], [13.2, 257757.0], [13.3, 257757.0], [13.4, 257803.0], [13.5, 257803.0], [13.6, 257803.0], [13.7, 257803.0], [13.8, 257803.0], [13.9, 257803.0], [14.0, 257803.0], [14.1, 257803.0], [14.2, 257997.0], [14.3, 257997.0], [14.4, 257997.0], [14.5, 257997.0], [14.6, 257997.0], [14.7, 257997.0], [14.8, 257997.0], [14.9, 257997.0], [15.0, 257997.0], [15.1, 258100.0], [15.2, 258100.0], [15.3, 258100.0], [15.4, 258100.0], [15.5, 258100.0], [15.6, 258100.0], [15.7, 258100.0], [15.8, 258100.0], [15.9, 258213.0], [16.0, 258213.0], [16.1, 258213.0], [16.2, 258213.0], [16.3, 258213.0], [16.4, 258213.0], [16.5, 258213.0], [16.6, 258213.0], [16.7, 258512.0], [16.8, 258512.0], [16.9, 258512.0], [17.0, 258512.0], [17.1, 258512.0], [17.2, 258512.0], [17.3, 258512.0], [17.4, 258512.0], [17.5, 258512.0], [17.6, 258704.0], [17.7, 258704.0], [17.8, 258704.0], [17.9, 258704.0], [18.0, 258704.0], [18.1, 258704.0], [18.2, 258704.0], [18.3, 258704.0], [18.4, 258708.0], [18.5, 258708.0], [18.6, 258708.0], [18.7, 258708.0], [18.8, 258708.0], [18.9, 258708.0], [19.0, 258708.0], [19.1, 258708.0], [19.2, 258845.0], [19.3, 258845.0], [19.4, 258845.0], [19.5, 258845.0], [19.6, 258845.0], [19.7, 258845.0], [19.8, 258845.0], [19.9, 258845.0], [20.0, 258940.0], [20.1, 258940.0], [20.2, 258940.0], [20.3, 258940.0], [20.4, 258940.0], [20.5, 258940.0], [20.6, 258940.0], [20.7, 258940.0], [20.8, 258940.0], [20.9, 259069.0], [21.0, 259069.0], [21.1, 259069.0], [21.2, 259069.0], [21.3, 259069.0], [21.4, 259069.0], [21.5, 259069.0], [21.6, 259069.0], [21.7, 259344.0], [21.8, 259344.0], [21.9, 259344.0], [22.0, 259344.0], [22.1, 259344.0], [22.2, 259344.0], [22.3, 259344.0], [22.4, 259344.0], [22.5, 259449.0], [22.6, 259449.0], [22.7, 259449.0], [22.8, 259449.0], [22.9, 259449.0], [23.0, 259449.0], [23.1, 259449.0], [23.2, 259449.0], [23.3, 259449.0], [23.4, 259513.0], [23.5, 259513.0], [23.6, 259513.0], [23.7, 259513.0], [23.8, 259513.0], [23.9, 259513.0], [24.0, 259513.0], [24.1, 259513.0], [24.2, 259562.0], [24.3, 259562.0], [24.4, 259562.0], [24.5, 259562.0], [24.6, 259562.0], [24.7, 259562.0], [24.8, 259562.0], [24.9, 259562.0], [25.0, 259710.0], [25.1, 259710.0], [25.2, 259710.0], [25.3, 259710.0], [25.4, 259710.0], [25.5, 259710.0], [25.6, 259710.0], [25.7, 259710.0], [25.8, 259710.0], [25.9, 260068.0], [26.0, 260068.0], [26.1, 260068.0], [26.2, 260068.0], [26.3, 260068.0], [26.4, 260068.0], [26.5, 260068.0], [26.6, 260068.0], [26.7, 260305.0], [26.8, 260305.0], [26.9, 260305.0], [27.0, 260305.0], [27.1, 260305.0], [27.2, 260305.0], [27.3, 260305.0], [27.4, 260305.0], [27.5, 260321.0], [27.6, 260321.0], [27.7, 260321.0], [27.8, 260321.0], [27.9, 260321.0], [28.0, 260321.0], [28.1, 260321.0], [28.2, 260321.0], [28.3, 260321.0], [28.4, 260324.0], [28.5, 260324.0], [28.6, 260324.0], [28.7, 260324.0], [28.8, 260324.0], [28.9, 260324.0], [29.0, 260324.0], [29.1, 260324.0], [29.2, 260484.0], [29.3, 260484.0], [29.4, 260484.0], [29.5, 260484.0], [29.6, 260484.0], [29.7, 260484.0], [29.8, 260484.0], [29.9, 260484.0], [30.0, 260686.0], [30.1, 260686.0], [30.2, 260686.0], [30.3, 260686.0], [30.4, 260686.0], [30.5, 260686.0], [30.6, 260686.0], [30.7, 260686.0], [30.8, 260686.0], [30.9, 260841.0], [31.0, 260841.0], [31.1, 260841.0], [31.2, 260841.0], [31.3, 260841.0], [31.4, 260841.0], [31.5, 260841.0], [31.6, 260841.0], [31.7, 260877.0], [31.8, 260877.0], [31.9, 260877.0], [32.0, 260877.0], [32.1, 260877.0], [32.2, 260877.0], [32.3, 260877.0], [32.4, 260877.0], [32.5, 261157.0], [32.6, 261157.0], [32.7, 261157.0], [32.8, 261157.0], [32.9, 261157.0], [33.0, 261157.0], [33.1, 261157.0], [33.2, 261157.0], [33.3, 261157.0], [33.4, 261502.0], [33.5, 261502.0], [33.6, 261502.0], [33.7, 261502.0], [33.8, 261502.0], [33.9, 261502.0], [34.0, 261502.0], [34.1, 261502.0], [34.2, 261525.0], [34.3, 261525.0], [34.4, 261525.0], [34.5, 261525.0], [34.6, 261525.0], [34.7, 261525.0], [34.8, 261525.0], [34.9, 261525.0], [35.0, 261855.0], [35.1, 261855.0], [35.2, 261855.0], [35.3, 261855.0], [35.4, 261855.0], [35.5, 261855.0], [35.6, 261855.0], [35.7, 261855.0], [35.8, 261855.0], [35.9, 261871.0], [36.0, 261871.0], [36.1, 261871.0], [36.2, 261871.0], [36.3, 261871.0], [36.4, 261871.0], [36.5, 261871.0], [36.6, 261871.0], [36.7, 262002.0], [36.8, 262002.0], [36.9, 262002.0], [37.0, 262002.0], [37.1, 262002.0], [37.2, 262002.0], [37.3, 262002.0], [37.4, 262002.0], [37.5, 262054.0], [37.6, 262054.0], [37.7, 262054.0], [37.8, 262054.0], [37.9, 262054.0], [38.0, 262054.0], [38.1, 262054.0], [38.2, 262054.0], [38.3, 262054.0], [38.4, 262055.0], [38.5, 262055.0], [38.6, 262055.0], [38.7, 262055.0], [38.8, 262055.0], [38.9, 262055.0], [39.0, 262055.0], [39.1, 262055.0], [39.2, 262251.0], [39.3, 262251.0], [39.4, 262251.0], [39.5, 262251.0], [39.6, 262251.0], [39.7, 262251.0], [39.8, 262251.0], [39.9, 262251.0], [40.0, 262251.0], [40.1, 262292.0], [40.2, 262292.0], [40.3, 262292.0], [40.4, 262292.0], [40.5, 262292.0], [40.6, 262292.0], [40.7, 262292.0], [40.8, 262292.0], [40.9, 262459.0], [41.0, 262459.0], [41.1, 262459.0], [41.2, 262459.0], [41.3, 262459.0], [41.4, 262459.0], [41.5, 262459.0], [41.6, 262459.0], [41.7, 262475.0], [41.8, 262475.0], [41.9, 262475.0], [42.0, 262475.0], [42.1, 262475.0], [42.2, 262475.0], [42.3, 262475.0], [42.4, 262475.0], [42.5, 262475.0], [42.6, 262813.0], [42.7, 262813.0], [42.8, 262813.0], [42.9, 262813.0], [43.0, 262813.0], [43.1, 262813.0], [43.2, 262813.0], [43.3, 262813.0], [43.4, 262819.0], [43.5, 262819.0], [43.6, 262819.0], [43.7, 262819.0], [43.8, 262819.0], [43.9, 262819.0], [44.0, 262819.0], [44.1, 262819.0], [44.2, 262869.0], [44.3, 262869.0], [44.4, 262869.0], [44.5, 262869.0], [44.6, 262869.0], [44.7, 262869.0], [44.8, 262869.0], [44.9, 262869.0], [45.0, 262869.0], [45.1, 263450.0], [45.2, 263450.0], [45.3, 263450.0], [45.4, 263450.0], [45.5, 263450.0], [45.6, 263450.0], [45.7, 263450.0], [45.8, 263450.0], [45.9, 263582.0], [46.0, 263582.0], [46.1, 263582.0], [46.2, 263582.0], [46.3, 263582.0], [46.4, 263582.0], [46.5, 263582.0], [46.6, 263582.0], [46.7, 264066.0], [46.8, 264066.0], [46.9, 264066.0], [47.0, 264066.0], [47.1, 264066.0], [47.2, 264066.0], [47.3, 264066.0], [47.4, 264066.0], [47.5, 264066.0], [47.6, 264268.0], [47.7, 264268.0], [47.8, 264268.0], [47.9, 264268.0], [48.0, 264268.0], [48.1, 264268.0], [48.2, 264268.0], [48.3, 264268.0], [48.4, 264327.0], [48.5, 264327.0], [48.6, 264327.0], [48.7, 264327.0], [48.8, 264327.0], [48.9, 264327.0], [49.0, 264327.0], [49.1, 264327.0], [49.2, 264356.0], [49.3, 264356.0], [49.4, 264356.0], [49.5, 264356.0], [49.6, 264356.0], [49.7, 264356.0], [49.8, 264356.0], [49.9, 264356.0], [50.0, 264356.0], [50.1, 264684.0], [50.2, 264684.0], [50.3, 264684.0], [50.4, 264684.0], [50.5, 264684.0], [50.6, 264684.0], [50.7, 264684.0], [50.8, 264684.0], [50.9, 264838.0], [51.0, 264838.0], [51.1, 264838.0], [51.2, 264838.0], [51.3, 264838.0], [51.4, 264838.0], [51.5, 264838.0], [51.6, 264838.0], [51.7, 265094.0], [51.8, 265094.0], [51.9, 265094.0], [52.0, 265094.0], [52.1, 265094.0], [52.2, 265094.0], [52.3, 265094.0], [52.4, 265094.0], [52.5, 265094.0], [52.6, 265345.0], [52.7, 265345.0], [52.8, 265345.0], [52.9, 265345.0], [53.0, 265345.0], [53.1, 265345.0], [53.2, 265345.0], [53.3, 265345.0], [53.4, 265361.0], [53.5, 265361.0], [53.6, 265361.0], [53.7, 265361.0], [53.8, 265361.0], [53.9, 265361.0], [54.0, 265361.0], [54.1, 265361.0], [54.2, 265761.0], [54.3, 265761.0], [54.4, 265761.0], [54.5, 265761.0], [54.6, 265761.0], [54.7, 265761.0], [54.8, 265761.0], [54.9, 265761.0], [55.0, 265761.0], [55.1, 265863.0], [55.2, 265863.0], [55.3, 265863.0], [55.4, 265863.0], [55.5, 265863.0], [55.6, 265863.0], [55.7, 265863.0], [55.8, 265863.0], [55.9, 265919.0], [56.0, 265919.0], [56.1, 265919.0], [56.2, 265919.0], [56.3, 265919.0], [56.4, 265919.0], [56.5, 265919.0], [56.6, 265919.0], [56.7, 266100.0], [56.8, 266100.0], [56.9, 266100.0], [57.0, 266100.0], [57.1, 266100.0], [57.2, 266100.0], [57.3, 266100.0], [57.4, 266100.0], [57.5, 266100.0], [57.6, 266170.0], [57.7, 266170.0], [57.8, 266170.0], [57.9, 266170.0], [58.0, 266170.0], [58.1, 266170.0], [58.2, 266170.0], [58.3, 266170.0], [58.4, 266567.0], [58.5, 266567.0], [58.6, 266567.0], [58.7, 266567.0], [58.8, 266567.0], [58.9, 266567.0], [59.0, 266567.0], [59.1, 266567.0], [59.2, 266659.0], [59.3, 266659.0], [59.4, 266659.0], [59.5, 266659.0], [59.6, 266659.0], [59.7, 266659.0], [59.8, 266659.0], [59.9, 266659.0], [60.0, 266659.0], [60.1, 266757.0], [60.2, 266757.0], [60.3, 266757.0], [60.4, 266757.0], [60.5, 266757.0], [60.6, 266757.0], [60.7, 266757.0], [60.8, 266757.0], [60.9, 266936.0], [61.0, 266936.0], [61.1, 266936.0], [61.2, 266936.0], [61.3, 266936.0], [61.4, 266936.0], [61.5, 266936.0], [61.6, 266936.0], [61.7, 266960.0], [61.8, 266960.0], [61.9, 266960.0], [62.0, 266960.0], [62.1, 266960.0], [62.2, 266960.0], [62.3, 266960.0], [62.4, 266960.0], [62.5, 266960.0], [62.6, 266963.0], [62.7, 266963.0], [62.8, 266963.0], [62.9, 266963.0], [63.0, 266963.0], [63.1, 266963.0], [63.2, 266963.0], [63.3, 266963.0], [63.4, 266999.0], [63.5, 266999.0], [63.6, 266999.0], [63.7, 266999.0], [63.8, 266999.0], [63.9, 266999.0], [64.0, 266999.0], [64.1, 266999.0], [64.2, 267204.0], [64.3, 267204.0], [64.4, 267204.0], [64.5, 267204.0], [64.6, 267204.0], [64.7, 267204.0], [64.8, 267204.0], [64.9, 267204.0], [65.0, 267204.0], [65.1, 267258.0], [65.2, 267258.0], [65.3, 267258.0], [65.4, 267258.0], [65.5, 267258.0], [65.6, 267258.0], [65.7, 267258.0], [65.8, 267258.0], [65.9, 267305.0], [66.0, 267305.0], [66.1, 267305.0], [66.2, 267305.0], [66.3, 267305.0], [66.4, 267305.0], [66.5, 267305.0], [66.6, 267305.0], [66.7, 267344.0], [66.8, 267344.0], [66.9, 267344.0], [67.0, 267344.0], [67.1, 267344.0], [67.2, 267344.0], [67.3, 267344.0], [67.4, 267344.0], [67.5, 267344.0], [67.6, 267500.0], [67.7, 267500.0], [67.8, 267500.0], [67.9, 267500.0], [68.0, 267500.0], [68.1, 267500.0], [68.2, 267500.0], [68.3, 267500.0], [68.4, 267540.0], [68.5, 267540.0], [68.6, 267540.0], [68.7, 267540.0], [68.8, 267540.0], [68.9, 267540.0], [69.0, 267540.0], [69.1, 267540.0], [69.2, 267652.0], [69.3, 267652.0], [69.4, 267652.0], [69.5, 267652.0], [69.6, 267652.0], [69.7, 267652.0], [69.8, 267652.0], [69.9, 267652.0], [70.0, 267652.0], [70.1, 267689.0], [70.2, 267689.0], [70.3, 267689.0], [70.4, 267689.0], [70.5, 267689.0], [70.6, 267689.0], [70.7, 267689.0], [70.8, 267689.0], [70.9, 268081.0], [71.0, 268081.0], [71.1, 268081.0], [71.2, 268081.0], [71.3, 268081.0], [71.4, 268081.0], [71.5, 268081.0], [71.6, 268081.0], [71.7, 268173.0], [71.8, 268173.0], [71.9, 268173.0], [72.0, 268173.0], [72.1, 268173.0], [72.2, 268173.0], [72.3, 268173.0], [72.4, 268173.0], [72.5, 268173.0], [72.6, 268174.0], [72.7, 268174.0], [72.8, 268174.0], [72.9, 268174.0], [73.0, 268174.0], [73.1, 268174.0], [73.2, 268174.0], [73.3, 268174.0], [73.4, 268716.0], [73.5, 268716.0], [73.6, 268716.0], [73.7, 268716.0], [73.8, 268716.0], [73.9, 268716.0], [74.0, 268716.0], [74.1, 268716.0], [74.2, 268834.0], [74.3, 268834.0], [74.4, 268834.0], [74.5, 268834.0], [74.6, 268834.0], [74.7, 268834.0], [74.8, 268834.0], [74.9, 268834.0], [75.0, 268834.0], [75.1, 268943.0], [75.2, 268943.0], [75.3, 268943.0], [75.4, 268943.0], [75.5, 268943.0], [75.6, 268943.0], [75.7, 268943.0], [75.8, 268943.0], [75.9, 268993.0], [76.0, 268993.0], [76.1, 268993.0], [76.2, 268993.0], [76.3, 268993.0], [76.4, 268993.0], [76.5, 268993.0], [76.6, 268993.0], [76.7, 269093.0], [76.8, 269093.0], [76.9, 269093.0], [77.0, 269093.0], [77.1, 269093.0], [77.2, 269093.0], [77.3, 269093.0], [77.4, 269093.0], [77.5, 269094.0], [77.6, 269094.0], [77.7, 269094.0], [77.8, 269094.0], [77.9, 269094.0], [78.0, 269094.0], [78.1, 269094.0], [78.2, 269094.0], [78.3, 269094.0], [78.4, 269138.0], [78.5, 269138.0], [78.6, 269138.0], [78.7, 269138.0], [78.8, 269138.0], [78.9, 269138.0], [79.0, 269138.0], [79.1, 269138.0], [79.2, 269492.0], [79.3, 269492.0], [79.4, 269492.0], [79.5, 269492.0], [79.6, 269492.0], [79.7, 269492.0], [79.8, 269492.0], [79.9, 269492.0], [80.0, 269513.0], [80.1, 269513.0], [80.2, 269513.0], [80.3, 269513.0], [80.4, 269513.0], [80.5, 269513.0], [80.6, 269513.0], [80.7, 269513.0], [80.8, 269513.0], [80.9, 269580.0], [81.0, 269580.0], [81.1, 269580.0], [81.2, 269580.0], [81.3, 269580.0], [81.4, 269580.0], [81.5, 269580.0], [81.6, 269580.0], [81.7, 269597.0], [81.8, 269597.0], [81.9, 269597.0], [82.0, 269597.0], [82.1, 269597.0], [82.2, 269597.0], [82.3, 269597.0], [82.4, 269597.0], [82.5, 269602.0], [82.6, 269602.0], [82.7, 269602.0], [82.8, 269602.0], [82.9, 269602.0], [83.0, 269602.0], [83.1, 269602.0], [83.2, 269602.0], [83.3, 269602.0], [83.4, 269626.0], [83.5, 269626.0], [83.6, 269626.0], [83.7, 269626.0], [83.8, 269626.0], [83.9, 269626.0], [84.0, 269626.0], [84.1, 269626.0], [84.2, 269714.0], [84.3, 269714.0], [84.4, 269714.0], [84.5, 269714.0], [84.6, 269714.0], [84.7, 269714.0], [84.8, 269714.0], [84.9, 269714.0], [85.0, 269901.0], [85.1, 269901.0], [85.2, 269901.0], [85.3, 269901.0], [85.4, 269901.0], [85.5, 269901.0], [85.6, 269901.0], [85.7, 269901.0], [85.8, 269901.0], [85.9, 270132.0], [86.0, 270132.0], [86.1, 270132.0], [86.2, 270132.0], [86.3, 270132.0], [86.4, 270132.0], [86.5, 270132.0], [86.6, 270132.0], [86.7, 270184.0], [86.8, 270184.0], [86.9, 270184.0], [87.0, 270184.0], [87.1, 270184.0], [87.2, 270184.0], [87.3, 270184.0], [87.4, 270184.0], [87.5, 270195.0], [87.6, 270195.0], [87.7, 270195.0], [87.8, 270195.0], [87.9, 270195.0], [88.0, 270195.0], [88.1, 270195.0], [88.2, 270195.0], [88.3, 270195.0], [88.4, 270206.0], [88.5, 270206.0], [88.6, 270206.0], [88.7, 270206.0], [88.8, 270206.0], [88.9, 270206.0], [89.0, 270206.0], [89.1, 270206.0], [89.2, 270260.0], [89.3, 270260.0], [89.4, 270260.0], [89.5, 270260.0], [89.6, 270260.0], [89.7, 270260.0], [89.8, 270260.0], [89.9, 270260.0], [90.0, 270397.0], [90.1, 270397.0], [90.2, 270397.0], [90.3, 270397.0], [90.4, 270397.0], [90.5, 270397.0], [90.6, 270397.0], [90.7, 270397.0], [90.8, 270397.0], [90.9, 270432.0], [91.0, 270432.0], [91.1, 270432.0], [91.2, 270432.0], [91.3, 270432.0], [91.4, 270432.0], [91.5, 270432.0], [91.6, 270432.0], [91.7, 270858.0], [91.8, 270858.0], [91.9, 270858.0], [92.0, 270858.0], [92.1, 270858.0], [92.2, 270858.0], [92.3, 270858.0], [92.4, 270858.0], [92.5, 271067.0], [92.6, 271067.0], [92.7, 271067.0], [92.8, 271067.0], [92.9, 271067.0], [93.0, 271067.0], [93.1, 271067.0], [93.2, 271067.0], [93.3, 271067.0], [93.4, 271105.0], [93.5, 271105.0], [93.6, 271105.0], [93.7, 271105.0], [93.8, 271105.0], [93.9, 271105.0], [94.0, 271105.0], [94.1, 271105.0], [94.2, 271579.0], [94.3, 271579.0], [94.4, 271579.0], [94.5, 271579.0], [94.6, 271579.0], [94.7, 271579.0], [94.8, 271579.0], [94.9, 271579.0], [95.0, 271840.0], [95.1, 271840.0], [95.2, 271840.0], [95.3, 271840.0], [95.4, 271840.0], [95.5, 271840.0], [95.6, 271840.0], [95.7, 271840.0], [95.8, 271840.0], [95.9, 271990.0], [96.0, 271990.0], [96.1, 271990.0], [96.2, 271990.0], [96.3, 271990.0], [96.4, 271990.0], [96.5, 271990.0], [96.6, 271990.0], [96.7, 272110.0], [96.8, 272110.0], [96.9, 272110.0], [97.0, 272110.0], [97.1, 272110.0], [97.2, 272110.0], [97.3, 272110.0], [97.4, 272110.0], [97.5, 272150.0], [97.6, 272150.0], [97.7, 272150.0], [97.8, 272150.0], [97.9, 272150.0], [98.0, 272150.0], [98.1, 272150.0], [98.2, 272150.0], [98.3, 272150.0], [98.4, 272840.0], [98.5, 272840.0], [98.6, 272840.0], [98.7, 272840.0], [98.8, 272840.0], [98.9, 272840.0], [99.0, 272840.0], [99.1, 272840.0], [99.2, 275581.0], [99.3, 275581.0], [99.4, 275581.0], [99.5, 275581.0], [99.6, 275581.0], [99.7, 275581.0], [99.8, 275581.0], [99.9, 275581.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 234000.0, "maxY": 4.0, "series": [{"data": [[265700.0, 1.0], [268900.0, 2.0], [272100.0, 2.0], [267300.0, 2.0], [268100.0, 2.0], [266500.0, 1.0], [269700.0, 1.0], [234000.0, 1.0], [241200.0, 1.0], [260000.0, 1.0], [260800.0, 2.0], [260400.0, 1.0], [262000.0, 3.0], [256400.0, 1.0], [258800.0, 1.0], [256000.0, 1.0], [264000.0, 1.0], [262400.0, 2.0], [264800.0, 1.0], [272800.0, 1.0], [269600.0, 2.0], [268000.0, 1.0], [268800.0, 1.0], [267200.0, 2.0], [270400.0, 1.0], [264300.0, 2.0], [265900.0, 1.0], [263500.0, 1.0], [267500.0, 2.0], [275500.0, 1.0], [266700.0, 1.0], [269900.0, 1.0], [269100.0, 1.0], [271500.0, 1.0], [240900.0, 1.0], [257300.0, 2.0], [259300.0, 1.0], [258100.0, 1.0], [259700.0, 1.0], [258500.0, 1.0], [257700.0, 1.0], [258900.0, 1.0], [263400.0, 1.0], [266600.0, 1.0], [265800.0, 1.0], [265000.0, 1.0], [269000.0, 2.0], [264200.0, 1.0], [266100.0, 2.0], [265300.0, 2.0], [266900.0, 4.0], [270100.0, 3.0], [255800.0, 1.0], [258200.0, 1.0], [254200.0, 1.0], [259400.0, 1.0], [257800.0, 1.0], [259000.0, 1.0], [257400.0, 2.0], [256600.0, 1.0], [261800.0, 2.0], [260600.0, 1.0], [262800.0, 3.0], [267600.0, 2.0], [270800.0, 1.0], [268700.0, 1.0], [269500.0, 3.0], [271100.0, 1.0], [271900.0, 1.0], [270300.0, 1.0], [238700.0, 1.0], [260300.0, 3.0], [259500.0, 2.0], [257500.0, 1.0], [258700.0, 2.0], [254700.0, 1.0], [257900.0, 1.0], [261500.0, 2.0], [261100.0, 1.0], [262200.0, 2.0], [264600.0, 1.0], [269400.0, 1.0], [271800.0, 1.0], [270200.0, 2.0], [271000.0, 1.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 275500.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 28.53571428571429, "minX": 1.52075244E12, "maxY": 60.0, "series": [{"data": [[1.52075274E12, 28.53571428571429], [1.52075244E12, 60.0], [1.5207525E12, 60.0], [1.52075268E12, 58.5]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52075274E12, "title": "Active Threads Over Time"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 256009.0, "minX": 1.0, "maxY": 272110.0, "series": [{"data": [[2.0, 261525.0], [3.0, 267652.0], [4.0, 267204.0], [5.0, 262054.0], [6.0, 270858.0], [7.0, 272110.0], [8.0, 270206.0], [9.0, 270432.0], [10.0, 267344.0], [11.0, 267258.0], [12.0, 266999.0], [13.0, 271067.0], [14.0, 268834.0], [15.0, 271579.0], [16.0, 270132.0], [17.0, 268943.0], [18.0, 267689.0], [19.0, 269513.0], [20.0, 270260.0], [21.0, 270397.0], [22.0, 269094.0], [23.0, 264268.0], [24.0, 271990.0], [26.0, 271472.5], [27.0, 270195.0], [28.0, 268174.0], [29.0, 269626.0], [30.0, 269138.0], [31.0, 269492.0], [33.0, 266963.0], [32.0, 269580.0], [35.0, 266960.0], [34.0, 269093.0], [37.0, 269602.0], [36.0, 268081.0], [39.0, 270184.0], [38.0, 269901.0], [41.0, 269597.0], [40.0, 266936.0], [43.0, 268108.0], [45.0, 266567.0], [44.0, 269714.0], [47.0, 265094.0], [46.0, 266757.0], [49.0, 268173.0], [48.0, 266100.0], [51.0, 267305.0], [50.0, 265361.0], [53.0, 264327.0], [52.0, 265345.0], [55.0, 262292.0], [54.0, 265863.0], [57.0, 257757.0], [56.0, 258940.0], [59.0, 256009.0], [58.0, 256685.0], [60.0, 260044.06557377052], [1.0, 260686.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[45.26666666666667, 263631.28333333344]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 60.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8.15, "minX": 1.52075244E12, "maxY": 41128.35, "series": [{"data": [[1.52075274E12, 40406.8], [1.52075244E12, 41128.35], [1.5207525E12, 2164.65], [1.52075268E12, 2886.2]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52075274E12, 152.13333333333333], [1.52075244E12, 154.85], [1.5207525E12, 8.15], [1.52075268E12, 10.866666666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52075274E12, "title": "Bytes Throughput Over Time"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 256564.75, "minX": 1.52075244E12, "maxY": 273523.6666666667, "series": [{"data": [[1.52075274E12, 267903.8392857143], [1.52075244E12, 259408.92982456143], [1.5207525E12, 273523.6666666667], [1.52075268E12, 256564.75]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52075274E12, "title": "Response Time Over Time"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 34000.75, "minX": 1.52075244E12, "maxY": 51965.32142857142, "series": [{"data": [[1.52075274E12, 51965.32142857142], [1.52075244E12, 48824.36842105264], [1.5207525E12, 50300.333333333336], [1.52075268E12, 34000.75]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52075274E12, "title": "Latencies Over Time"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 10.0, "minX": 1.52075244E12, "maxY": 12.333333333333334, "series": [{"data": [[1.52075274E12, 11.803571428571427], [1.52075244E12, 12.333333333333334], [1.5207525E12, 10.0], [1.52075268E12, 11.75]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52075274E12, "title": "Connect Time Over Time"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 234031.0, "minX": 1.52075244E12, "maxY": 275581.0, "series": [{"data": [[1.52075274E12, 272110.0], [1.52075244E12, 268993.0], [1.5207525E12, 275581.0], [1.52075268E12, 257757.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52075274E12, 258940.0], [1.52075244E12, 234031.0], [1.5207525E12, 272150.0], [1.52075268E12, 255808.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52075274E12, 270383.3], [1.52075244E12, 265792.6], [1.5207525E12, 266610.1], [1.52075268E12, 266414.5]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52075274E12, 275005.38999999996], [1.52075244E12, 268993.0], [1.5207525E12, 275581.0], [1.52075268E12, 275581.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52075274E12, 271826.95], [1.52075244E12, 266747.1], [1.5207525E12, 271992.14999999997], [1.52075268E12, 271360.75]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52075274E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
    data: {"result": {"minY": 264520.0, "minX": 0.0, "maxY": 264520.0, "series": [{"data": [[0.0, 264520.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 52182.5, "minX": 0.0, "maxY": 52182.5, "series": [{"data": [[0.0, 52182.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 0.08333333333333333, "minX": 1.5207522E12, "maxY": 1.0, "series": [{"data": [[1.52075244E12, 0.08333333333333333], [1.5207525E12, 0.9166666666666666], [1.5207522E12, 1.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5207525E12, "title": "Hits Per Second"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 0.05, "minX": 1.52075244E12, "maxY": 0.95, "series": [{"data": [[1.52075274E12, 0.9333333333333333], [1.52075244E12, 0.95], [1.5207525E12, 0.05], [1.52075268E12, 0.06666666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52075274E12, "title": "Codes Per Second"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 0.05, "minX": 1.52075244E12, "maxY": 0.95, "series": [{"data": [[1.52075274E12, 0.9333333333333333], [1.52075244E12, 0.95], [1.5207525E12, 0.05], [1.52075268E12, 0.06666666666666667]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52075274E12, "title": "Transactions Per Second"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
