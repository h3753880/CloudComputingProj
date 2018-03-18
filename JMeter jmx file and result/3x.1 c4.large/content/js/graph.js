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
        data: {"result": {"minY": 169790.0, "minX": 0.0, "maxY": 252071.0, "series": [{"data": [[0.0, 169790.0], [0.1, 169790.0], [0.2, 169790.0], [0.3, 169790.0], [0.4, 169790.0], [0.5, 169790.0], [0.6, 169790.0], [0.7, 169790.0], [0.8, 169790.0], [0.9, 172073.0], [1.0, 172073.0], [1.1, 172073.0], [1.2, 172073.0], [1.3, 172073.0], [1.4, 172073.0], [1.5, 172073.0], [1.6, 172073.0], [1.7, 172497.0], [1.8, 172497.0], [1.9, 172497.0], [2.0, 172497.0], [2.1, 172497.0], [2.2, 172497.0], [2.3, 172497.0], [2.4, 172497.0], [2.5, 172718.0], [2.6, 172718.0], [2.7, 172718.0], [2.8, 172718.0], [2.9, 172718.0], [3.0, 172718.0], [3.1, 172718.0], [3.2, 172718.0], [3.3, 172718.0], [3.4, 172971.0], [3.5, 172971.0], [3.6, 172971.0], [3.7, 172971.0], [3.8, 172971.0], [3.9, 172971.0], [4.0, 172971.0], [4.1, 172971.0], [4.2, 172972.0], [4.3, 172972.0], [4.4, 172972.0], [4.5, 172972.0], [4.6, 172972.0], [4.7, 172972.0], [4.8, 172972.0], [4.9, 172972.0], [5.0, 173555.0], [5.1, 173555.0], [5.2, 173555.0], [5.3, 173555.0], [5.4, 173555.0], [5.5, 173555.0], [5.6, 173555.0], [5.7, 173555.0], [5.8, 173555.0], [5.9, 173585.0], [6.0, 173585.0], [6.1, 173585.0], [6.2, 173585.0], [6.3, 173585.0], [6.4, 173585.0], [6.5, 173585.0], [6.6, 173585.0], [6.7, 173837.0], [6.8, 173837.0], [6.9, 173837.0], [7.0, 173837.0], [7.1, 173837.0], [7.2, 173837.0], [7.3, 173837.0], [7.4, 173837.0], [7.5, 173919.0], [7.6, 173919.0], [7.7, 173919.0], [7.8, 173919.0], [7.9, 173919.0], [8.0, 173919.0], [8.1, 173919.0], [8.2, 173919.0], [8.3, 173919.0], [8.4, 173927.0], [8.5, 173927.0], [8.6, 173927.0], [8.7, 173927.0], [8.8, 173927.0], [8.9, 173927.0], [9.0, 173927.0], [9.1, 173927.0], [9.2, 174068.0], [9.3, 174068.0], [9.4, 174068.0], [9.5, 174068.0], [9.6, 174068.0], [9.7, 174068.0], [9.8, 174068.0], [9.9, 174068.0], [10.0, 174464.0], [10.1, 174464.0], [10.2, 174464.0], [10.3, 174464.0], [10.4, 174464.0], [10.5, 174464.0], [10.6, 174464.0], [10.7, 174464.0], [10.8, 174464.0], [10.9, 174517.0], [11.0, 174517.0], [11.1, 174517.0], [11.2, 174517.0], [11.3, 174517.0], [11.4, 174517.0], [11.5, 174517.0], [11.6, 174517.0], [11.7, 174783.0], [11.8, 174783.0], [11.9, 174783.0], [12.0, 174783.0], [12.1, 174783.0], [12.2, 174783.0], [12.3, 174783.0], [12.4, 174783.0], [12.5, 174783.0], [12.6, 175981.0], [12.7, 175981.0], [12.8, 175981.0], [12.9, 175981.0], [13.0, 175981.0], [13.1, 175981.0], [13.2, 175981.0], [13.3, 175981.0], [13.4, 176351.0], [13.5, 176351.0], [13.6, 176351.0], [13.7, 176351.0], [13.8, 176351.0], [13.9, 176351.0], [14.0, 176351.0], [14.1, 176351.0], [14.2, 176494.0], [14.3, 176494.0], [14.4, 176494.0], [14.5, 176494.0], [14.6, 176494.0], [14.7, 176494.0], [14.8, 176494.0], [14.9, 176494.0], [15.0, 176494.0], [15.1, 176520.0], [15.2, 176520.0], [15.3, 176520.0], [15.4, 176520.0], [15.5, 176520.0], [15.6, 176520.0], [15.7, 176520.0], [15.8, 176520.0], [15.9, 176612.0], [16.0, 176612.0], [16.1, 176612.0], [16.2, 176612.0], [16.3, 176612.0], [16.4, 176612.0], [16.5, 176612.0], [16.6, 176612.0], [16.7, 176759.0], [16.8, 176759.0], [16.9, 176759.0], [17.0, 176759.0], [17.1, 176759.0], [17.2, 176759.0], [17.3, 176759.0], [17.4, 176759.0], [17.5, 176759.0], [17.6, 176759.0], [17.7, 176759.0], [17.8, 176759.0], [17.9, 176759.0], [18.0, 176759.0], [18.1, 176759.0], [18.2, 176759.0], [18.3, 176759.0], [18.4, 176762.0], [18.5, 176762.0], [18.6, 176762.0], [18.7, 176762.0], [18.8, 176762.0], [18.9, 176762.0], [19.0, 176762.0], [19.1, 176762.0], [19.2, 176942.0], [19.3, 176942.0], [19.4, 176942.0], [19.5, 176942.0], [19.6, 176942.0], [19.7, 176942.0], [19.8, 176942.0], [19.9, 176942.0], [20.0, 176942.0], [20.1, 177115.0], [20.2, 177115.0], [20.3, 177115.0], [20.4, 177115.0], [20.5, 177115.0], [20.6, 177115.0], [20.7, 177115.0], [20.8, 177115.0], [20.9, 177336.0], [21.0, 177336.0], [21.1, 177336.0], [21.2, 177336.0], [21.3, 177336.0], [21.4, 177336.0], [21.5, 177336.0], [21.6, 177336.0], [21.7, 177377.0], [21.8, 177377.0], [21.9, 177377.0], [22.0, 177377.0], [22.1, 177377.0], [22.2, 177377.0], [22.3, 177377.0], [22.4, 177377.0], [22.5, 177623.0], [22.6, 177623.0], [22.7, 177623.0], [22.8, 177623.0], [22.9, 177623.0], [23.0, 177623.0], [23.1, 177623.0], [23.2, 177623.0], [23.3, 177623.0], [23.4, 178391.0], [23.5, 178391.0], [23.6, 178391.0], [23.7, 178391.0], [23.8, 178391.0], [23.9, 178391.0], [24.0, 178391.0], [24.1, 178391.0], [24.2, 178520.0], [24.3, 178520.0], [24.4, 178520.0], [24.5, 178520.0], [24.6, 178520.0], [24.7, 178520.0], [24.8, 178520.0], [24.9, 178520.0], [25.0, 178528.0], [25.1, 178528.0], [25.2, 178528.0], [25.3, 178528.0], [25.4, 178528.0], [25.5, 178528.0], [25.6, 178528.0], [25.7, 178528.0], [25.8, 178528.0], [25.9, 178875.0], [26.0, 178875.0], [26.1, 178875.0], [26.2, 178875.0], [26.3, 178875.0], [26.4, 178875.0], [26.5, 178875.0], [26.6, 178875.0], [26.7, 179161.0], [26.8, 179161.0], [26.9, 179161.0], [27.0, 179161.0], [27.1, 179161.0], [27.2, 179161.0], [27.3, 179161.0], [27.4, 179161.0], [27.5, 179349.0], [27.6, 179349.0], [27.7, 179349.0], [27.8, 179349.0], [27.9, 179349.0], [28.0, 179349.0], [28.1, 179349.0], [28.2, 179349.0], [28.3, 179349.0], [28.4, 179446.0], [28.5, 179446.0], [28.6, 179446.0], [28.7, 179446.0], [28.8, 179446.0], [28.9, 179446.0], [29.0, 179446.0], [29.1, 179446.0], [29.2, 179492.0], [29.3, 179492.0], [29.4, 179492.0], [29.5, 179492.0], [29.6, 179492.0], [29.7, 179492.0], [29.8, 179492.0], [29.9, 179492.0], [30.0, 179534.0], [30.1, 179534.0], [30.2, 179534.0], [30.3, 179534.0], [30.4, 179534.0], [30.5, 179534.0], [30.6, 179534.0], [30.7, 179534.0], [30.8, 179534.0], [30.9, 179911.0], [31.0, 179911.0], [31.1, 179911.0], [31.2, 179911.0], [31.3, 179911.0], [31.4, 179911.0], [31.5, 179911.0], [31.6, 179911.0], [31.7, 181562.0], [31.8, 181562.0], [31.9, 181562.0], [32.0, 181562.0], [32.1, 181562.0], [32.2, 181562.0], [32.3, 181562.0], [32.4, 181562.0], [32.5, 181618.0], [32.6, 181618.0], [32.7, 181618.0], [32.8, 181618.0], [32.9, 181618.0], [33.0, 181618.0], [33.1, 181618.0], [33.2, 181618.0], [33.3, 181618.0], [33.4, 181947.0], [33.5, 181947.0], [33.6, 181947.0], [33.7, 181947.0], [33.8, 181947.0], [33.9, 181947.0], [34.0, 181947.0], [34.1, 181947.0], [34.2, 181985.0], [34.3, 181985.0], [34.4, 181985.0], [34.5, 181985.0], [34.6, 181985.0], [34.7, 181985.0], [34.8, 181985.0], [34.9, 181985.0], [35.0, 182545.0], [35.1, 182545.0], [35.2, 182545.0], [35.3, 182545.0], [35.4, 182545.0], [35.5, 182545.0], [35.6, 182545.0], [35.7, 182545.0], [35.8, 182545.0], [35.9, 182652.0], [36.0, 182652.0], [36.1, 182652.0], [36.2, 182652.0], [36.3, 182652.0], [36.4, 182652.0], [36.5, 182652.0], [36.6, 182652.0], [36.7, 183192.0], [36.8, 183192.0], [36.9, 183192.0], [37.0, 183192.0], [37.1, 183192.0], [37.2, 183192.0], [37.3, 183192.0], [37.4, 183192.0], [37.5, 183356.0], [37.6, 183356.0], [37.7, 183356.0], [37.8, 183356.0], [37.9, 183356.0], [38.0, 183356.0], [38.1, 183356.0], [38.2, 183356.0], [38.3, 183356.0], [38.4, 184491.0], [38.5, 184491.0], [38.6, 184491.0], [38.7, 184491.0], [38.8, 184491.0], [38.9, 184491.0], [39.0, 184491.0], [39.1, 184491.0], [39.2, 185596.0], [39.3, 185596.0], [39.4, 185596.0], [39.5, 185596.0], [39.6, 185596.0], [39.7, 185596.0], [39.8, 185596.0], [39.9, 185596.0], [40.0, 185596.0], [40.1, 185923.0], [40.2, 185923.0], [40.3, 185923.0], [40.4, 185923.0], [40.5, 185923.0], [40.6, 185923.0], [40.7, 185923.0], [40.8, 185923.0], [40.9, 187009.0], [41.0, 187009.0], [41.1, 187009.0], [41.2, 187009.0], [41.3, 187009.0], [41.4, 187009.0], [41.5, 187009.0], [41.6, 187009.0], [41.7, 187096.0], [41.8, 187096.0], [41.9, 187096.0], [42.0, 187096.0], [42.1, 187096.0], [42.2, 187096.0], [42.3, 187096.0], [42.4, 187096.0], [42.5, 187096.0], [42.6, 187492.0], [42.7, 187492.0], [42.8, 187492.0], [42.9, 187492.0], [43.0, 187492.0], [43.1, 187492.0], [43.2, 187492.0], [43.3, 187492.0], [43.4, 189170.0], [43.5, 189170.0], [43.6, 189170.0], [43.7, 189170.0], [43.8, 189170.0], [43.9, 189170.0], [44.0, 189170.0], [44.1, 189170.0], [44.2, 189334.0], [44.3, 189334.0], [44.4, 189334.0], [44.5, 189334.0], [44.6, 189334.0], [44.7, 189334.0], [44.8, 189334.0], [44.9, 189334.0], [45.0, 189334.0], [45.1, 190229.0], [45.2, 190229.0], [45.3, 190229.0], [45.4, 190229.0], [45.5, 190229.0], [45.6, 190229.0], [45.7, 190229.0], [45.8, 190229.0], [45.9, 191645.0], [46.0, 191645.0], [46.1, 191645.0], [46.2, 191645.0], [46.3, 191645.0], [46.4, 191645.0], [46.5, 191645.0], [46.6, 191645.0], [46.7, 192220.0], [46.8, 192220.0], [46.9, 192220.0], [47.0, 192220.0], [47.1, 192220.0], [47.2, 192220.0], [47.3, 192220.0], [47.4, 192220.0], [47.5, 192220.0], [47.6, 193130.0], [47.7, 193130.0], [47.8, 193130.0], [47.9, 193130.0], [48.0, 193130.0], [48.1, 193130.0], [48.2, 193130.0], [48.3, 193130.0], [48.4, 195776.0], [48.5, 195776.0], [48.6, 195776.0], [48.7, 195776.0], [48.8, 195776.0], [48.9, 195776.0], [49.0, 195776.0], [49.1, 195776.0], [49.2, 200382.0], [49.3, 200382.0], [49.4, 200382.0], [49.5, 200382.0], [49.6, 200382.0], [49.7, 200382.0], [49.8, 200382.0], [49.9, 200382.0], [50.0, 200382.0], [50.1, 217590.0], [50.2, 217590.0], [50.3, 217590.0], [50.4, 217590.0], [50.5, 217590.0], [50.6, 217590.0], [50.7, 217590.0], [50.8, 217590.0], [50.9, 219208.0], [51.0, 219208.0], [51.1, 219208.0], [51.2, 219208.0], [51.3, 219208.0], [51.4, 219208.0], [51.5, 219208.0], [51.6, 219208.0], [51.7, 219710.0], [51.8, 219710.0], [51.9, 219710.0], [52.0, 219710.0], [52.1, 219710.0], [52.2, 219710.0], [52.3, 219710.0], [52.4, 219710.0], [52.5, 219710.0], [52.6, 220060.0], [52.7, 220060.0], [52.8, 220060.0], [52.9, 220060.0], [53.0, 220060.0], [53.1, 220060.0], [53.2, 220060.0], [53.3, 220060.0], [53.4, 222232.0], [53.5, 222232.0], [53.6, 222232.0], [53.7, 222232.0], [53.8, 222232.0], [53.9, 222232.0], [54.0, 222232.0], [54.1, 222232.0], [54.2, 222437.0], [54.3, 222437.0], [54.4, 222437.0], [54.5, 222437.0], [54.6, 222437.0], [54.7, 222437.0], [54.8, 222437.0], [54.9, 222437.0], [55.0, 222437.0], [55.1, 223094.0], [55.2, 223094.0], [55.3, 223094.0], [55.4, 223094.0], [55.5, 223094.0], [55.6, 223094.0], [55.7, 223094.0], [55.8, 223094.0], [55.9, 223363.0], [56.0, 223363.0], [56.1, 223363.0], [56.2, 223363.0], [56.3, 223363.0], [56.4, 223363.0], [56.5, 223363.0], [56.6, 223363.0], [56.7, 223489.0], [56.8, 223489.0], [56.9, 223489.0], [57.0, 223489.0], [57.1, 223489.0], [57.2, 223489.0], [57.3, 223489.0], [57.4, 223489.0], [57.5, 223489.0], [57.6, 230314.0], [57.7, 230314.0], [57.8, 230314.0], [57.9, 230314.0], [58.0, 230314.0], [58.1, 230314.0], [58.2, 230314.0], [58.3, 230314.0], [58.4, 230318.0], [58.5, 230318.0], [58.6, 230318.0], [58.7, 230318.0], [58.8, 230318.0], [58.9, 230318.0], [59.0, 230318.0], [59.1, 230318.0], [59.2, 233174.0], [59.3, 233174.0], [59.4, 233174.0], [59.5, 233174.0], [59.6, 233174.0], [59.7, 233174.0], [59.8, 233174.0], [59.9, 233174.0], [60.0, 233174.0], [60.1, 233572.0], [60.2, 233572.0], [60.3, 233572.0], [60.4, 233572.0], [60.5, 233572.0], [60.6, 233572.0], [60.7, 233572.0], [60.8, 233572.0], [60.9, 236011.0], [61.0, 236011.0], [61.1, 236011.0], [61.2, 236011.0], [61.3, 236011.0], [61.4, 236011.0], [61.5, 236011.0], [61.6, 236011.0], [61.7, 236291.0], [61.8, 236291.0], [61.9, 236291.0], [62.0, 236291.0], [62.1, 236291.0], [62.2, 236291.0], [62.3, 236291.0], [62.4, 236291.0], [62.5, 236291.0], [62.6, 237226.0], [62.7, 237226.0], [62.8, 237226.0], [62.9, 237226.0], [63.0, 237226.0], [63.1, 237226.0], [63.2, 237226.0], [63.3, 237226.0], [63.4, 238494.0], [63.5, 238494.0], [63.6, 238494.0], [63.7, 238494.0], [63.8, 238494.0], [63.9, 238494.0], [64.0, 238494.0], [64.1, 238494.0], [64.2, 238605.0], [64.3, 238605.0], [64.4, 238605.0], [64.5, 238605.0], [64.6, 238605.0], [64.7, 238605.0], [64.8, 238605.0], [64.9, 238605.0], [65.0, 238605.0], [65.1, 239103.0], [65.2, 239103.0], [65.3, 239103.0], [65.4, 239103.0], [65.5, 239103.0], [65.6, 239103.0], [65.7, 239103.0], [65.8, 239103.0], [65.9, 239172.0], [66.0, 239172.0], [66.1, 239172.0], [66.2, 239172.0], [66.3, 239172.0], [66.4, 239172.0], [66.5, 239172.0], [66.6, 239172.0], [66.7, 239404.0], [66.8, 239404.0], [66.9, 239404.0], [67.0, 239404.0], [67.1, 239404.0], [67.2, 239404.0], [67.3, 239404.0], [67.4, 239404.0], [67.5, 239404.0], [67.6, 239530.0], [67.7, 239530.0], [67.8, 239530.0], [67.9, 239530.0], [68.0, 239530.0], [68.1, 239530.0], [68.2, 239530.0], [68.3, 239530.0], [68.4, 239806.0], [68.5, 239806.0], [68.6, 239806.0], [68.7, 239806.0], [68.8, 239806.0], [68.9, 239806.0], [69.0, 239806.0], [69.1, 239806.0], [69.2, 239921.0], [69.3, 239921.0], [69.4, 239921.0], [69.5, 239921.0], [69.6, 239921.0], [69.7, 239921.0], [69.8, 239921.0], [69.9, 239921.0], [70.0, 239921.0], [70.1, 240156.0], [70.2, 240156.0], [70.3, 240156.0], [70.4, 240156.0], [70.5, 240156.0], [70.6, 240156.0], [70.7, 240156.0], [70.8, 240156.0], [70.9, 240207.0], [71.0, 240207.0], [71.1, 240207.0], [71.2, 240207.0], [71.3, 240207.0], [71.4, 240207.0], [71.5, 240207.0], [71.6, 240207.0], [71.7, 240337.0], [71.8, 240337.0], [71.9, 240337.0], [72.0, 240337.0], [72.1, 240337.0], [72.2, 240337.0], [72.3, 240337.0], [72.4, 240337.0], [72.5, 240337.0], [72.6, 240444.0], [72.7, 240444.0], [72.8, 240444.0], [72.9, 240444.0], [73.0, 240444.0], [73.1, 240444.0], [73.2, 240444.0], [73.3, 240444.0], [73.4, 240796.0], [73.5, 240796.0], [73.6, 240796.0], [73.7, 240796.0], [73.8, 240796.0], [73.9, 240796.0], [74.0, 240796.0], [74.1, 240796.0], [74.2, 240852.0], [74.3, 240852.0], [74.4, 240852.0], [74.5, 240852.0], [74.6, 240852.0], [74.7, 240852.0], [74.8, 240852.0], [74.9, 240852.0], [75.0, 240852.0], [75.1, 240868.0], [75.2, 240868.0], [75.3, 240868.0], [75.4, 240868.0], [75.5, 240868.0], [75.6, 240868.0], [75.7, 240868.0], [75.8, 240868.0], [75.9, 241130.0], [76.0, 241130.0], [76.1, 241130.0], [76.2, 241130.0], [76.3, 241130.0], [76.4, 241130.0], [76.5, 241130.0], [76.6, 241130.0], [76.7, 241209.0], [76.8, 241209.0], [76.9, 241209.0], [77.0, 241209.0], [77.1, 241209.0], [77.2, 241209.0], [77.3, 241209.0], [77.4, 241209.0], [77.5, 241645.0], [77.6, 241645.0], [77.7, 241645.0], [77.8, 241645.0], [77.9, 241645.0], [78.0, 241645.0], [78.1, 241645.0], [78.2, 241645.0], [78.3, 241645.0], [78.4, 241665.0], [78.5, 241665.0], [78.6, 241665.0], [78.7, 241665.0], [78.8, 241665.0], [78.9, 241665.0], [79.0, 241665.0], [79.1, 241665.0], [79.2, 242005.0], [79.3, 242005.0], [79.4, 242005.0], [79.5, 242005.0], [79.6, 242005.0], [79.7, 242005.0], [79.8, 242005.0], [79.9, 242005.0], [80.0, 242087.0], [80.1, 242087.0], [80.2, 242087.0], [80.3, 242087.0], [80.4, 242087.0], [80.5, 242087.0], [80.6, 242087.0], [80.7, 242087.0], [80.8, 242087.0], [80.9, 242181.0], [81.0, 242181.0], [81.1, 242181.0], [81.2, 242181.0], [81.3, 242181.0], [81.4, 242181.0], [81.5, 242181.0], [81.6, 242181.0], [81.7, 242280.0], [81.8, 242280.0], [81.9, 242280.0], [82.0, 242280.0], [82.1, 242280.0], [82.2, 242280.0], [82.3, 242280.0], [82.4, 242280.0], [82.5, 242639.0], [82.6, 242639.0], [82.7, 242639.0], [82.8, 242639.0], [82.9, 242639.0], [83.0, 242639.0], [83.1, 242639.0], [83.2, 242639.0], [83.3, 242639.0], [83.4, 242993.0], [83.5, 242993.0], [83.6, 242993.0], [83.7, 242993.0], [83.8, 242993.0], [83.9, 242993.0], [84.0, 242993.0], [84.1, 242993.0], [84.2, 243242.0], [84.3, 243242.0], [84.4, 243242.0], [84.5, 243242.0], [84.6, 243242.0], [84.7, 243242.0], [84.8, 243242.0], [84.9, 243242.0], [85.0, 243326.0], [85.1, 243326.0], [85.2, 243326.0], [85.3, 243326.0], [85.4, 243326.0], [85.5, 243326.0], [85.6, 243326.0], [85.7, 243326.0], [85.8, 243326.0], [85.9, 243492.0], [86.0, 243492.0], [86.1, 243492.0], [86.2, 243492.0], [86.3, 243492.0], [86.4, 243492.0], [86.5, 243492.0], [86.6, 243492.0], [86.7, 243548.0], [86.8, 243548.0], [86.9, 243548.0], [87.0, 243548.0], [87.1, 243548.0], [87.2, 243548.0], [87.3, 243548.0], [87.4, 243548.0], [87.5, 243640.0], [87.6, 243640.0], [87.7, 243640.0], [87.8, 243640.0], [87.9, 243640.0], [88.0, 243640.0], [88.1, 243640.0], [88.2, 243640.0], [88.3, 243640.0], [88.4, 243810.0], [88.5, 243810.0], [88.6, 243810.0], [88.7, 243810.0], [88.8, 243810.0], [88.9, 243810.0], [89.0, 243810.0], [89.1, 243810.0], [89.2, 243829.0], [89.3, 243829.0], [89.4, 243829.0], [89.5, 243829.0], [89.6, 243829.0], [89.7, 243829.0], [89.8, 243829.0], [89.9, 243829.0], [90.0, 244017.0], [90.1, 244017.0], [90.2, 244017.0], [90.3, 244017.0], [90.4, 244017.0], [90.5, 244017.0], [90.6, 244017.0], [90.7, 244017.0], [90.8, 244017.0], [90.9, 244036.0], [91.0, 244036.0], [91.1, 244036.0], [91.2, 244036.0], [91.3, 244036.0], [91.4, 244036.0], [91.5, 244036.0], [91.6, 244036.0], [91.7, 244174.0], [91.8, 244174.0], [91.9, 244174.0], [92.0, 244174.0], [92.1, 244174.0], [92.2, 244174.0], [92.3, 244174.0], [92.4, 244174.0], [92.5, 244235.0], [92.6, 244235.0], [92.7, 244235.0], [92.8, 244235.0], [92.9, 244235.0], [93.0, 244235.0], [93.1, 244235.0], [93.2, 244235.0], [93.3, 244235.0], [93.4, 244256.0], [93.5, 244256.0], [93.6, 244256.0], [93.7, 244256.0], [93.8, 244256.0], [93.9, 244256.0], [94.0, 244256.0], [94.1, 244256.0], [94.2, 244405.0], [94.3, 244405.0], [94.4, 244405.0], [94.5, 244405.0], [94.6, 244405.0], [94.7, 244405.0], [94.8, 244405.0], [94.9, 244405.0], [95.0, 244452.0], [95.1, 244452.0], [95.2, 244452.0], [95.3, 244452.0], [95.4, 244452.0], [95.5, 244452.0], [95.6, 244452.0], [95.7, 244452.0], [95.8, 244452.0], [95.9, 244454.0], [96.0, 244454.0], [96.1, 244454.0], [96.2, 244454.0], [96.3, 244454.0], [96.4, 244454.0], [96.5, 244454.0], [96.6, 244454.0], [96.7, 244771.0], [96.8, 244771.0], [96.9, 244771.0], [97.0, 244771.0], [97.1, 244771.0], [97.2, 244771.0], [97.3, 244771.0], [97.4, 244771.0], [97.5, 245415.0], [97.6, 245415.0], [97.7, 245415.0], [97.8, 245415.0], [97.9, 245415.0], [98.0, 245415.0], [98.1, 245415.0], [98.2, 245415.0], [98.3, 245415.0], [98.4, 247104.0], [98.5, 247104.0], [98.6, 247104.0], [98.7, 247104.0], [98.8, 247104.0], [98.9, 247104.0], [99.0, 247104.0], [99.1, 247104.0], [99.2, 252071.0], [99.3, 252071.0], [99.4, 252071.0], [99.5, 252071.0], [99.6, 252071.0], [99.7, 252071.0], [99.8, 252071.0], [99.9, 252071.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 169700.0, "maxY": 3.0, "series": [{"data": [[172000.0, 1.0], [174400.0, 1.0], [177600.0, 1.0], [181600.0, 1.0], [219200.0, 1.0], [220000.0, 1.0], [222400.0, 1.0], [236000.0, 1.0], [241600.0, 2.0], [238400.0, 1.0], [240800.0, 2.0], [243200.0, 1.0], [244000.0, 2.0], [252000.0, 1.0], [169700.0, 1.0], [174500.0, 1.0], [179300.0, 1.0], [172900.0, 2.0], [176900.0, 1.0], [178500.0, 2.0], [182500.0, 1.0], [183300.0, 1.0], [223300.0, 1.0], [240100.0, 1.0], [244100.0, 1.0], [243300.0, 1.0], [179400.0, 2.0], [173800.0, 1.0], [182600.0, 1.0], [187400.0, 1.0], [192200.0, 1.0], [223400.0, 1.0], [236200.0, 1.0], [239400.0, 1.0], [240200.0, 1.0], [238600.0, 1.0], [243400.0, 1.0], [242600.0, 1.0], [244200.0, 2.0], [173900.0, 2.0], [177100.0, 1.0], [179500.0, 1.0], [176300.0, 1.0], [174700.0, 1.0], [185900.0, 1.0], [181900.0, 2.0], [189100.0, 1.0], [193100.0, 1.0], [200300.0, 1.0], [233100.0, 1.0], [239500.0, 1.0], [243500.0, 1.0], [240300.0, 1.0], [241100.0, 1.0], [178800.0, 1.0], [174000.0, 1.0], [176400.0, 1.0], [172400.0, 1.0], [184400.0, 1.0], [191600.0, 1.0], [237200.0, 1.0], [240400.0, 1.0], [241200.0, 1.0], [242000.0, 2.0], [243600.0, 1.0], [244400.0, 3.0], [177300.0, 2.0], [176500.0, 1.0], [189300.0, 1.0], [195700.0, 1.0], [219700.0, 1.0], [242100.0, 1.0], [242900.0, 1.0], [176600.0, 1.0], [187000.0, 2.0], [190200.0, 1.0], [222200.0, 1.0], [223000.0, 1.0], [239800.0, 1.0], [242200.0, 1.0], [245400.0, 1.0], [243800.0, 2.0], [179100.0, 1.0], [175900.0, 1.0], [176700.0, 3.0], [178300.0, 1.0], [173500.0, 2.0], [172700.0, 1.0], [179900.0, 1.0], [183100.0, 1.0], [185500.0, 1.0], [181500.0, 1.0], [217500.0, 1.0], [230300.0, 2.0], [233500.0, 1.0], [239100.0, 2.0], [239900.0, 1.0], [244700.0, 1.0], [240700.0, 1.0], [247100.0, 1.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 252000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 30.76666666666667, "minX": 1.52082108E12, "maxY": 60.0, "series": [{"data": [[1.52082114E12, 60.0], [1.52082126E12, 30.76666666666667], [1.52082108E12, 60.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082126E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 169790.0, "minX": 1.0, "maxY": 237350.59016393445, "series": [{"data": [[2.0, 187009.0], [3.0, 182545.0], [4.0, 179911.0], [5.0, 193130.0], [6.0, 187492.0], [7.0, 181985.0], [8.0, 195776.0], [9.0, 191645.0], [10.0, 169790.0], [11.0, 182652.0], [13.0, 174212.0], [18.0, 174901.0], [19.0, 178528.0], [20.0, 176762.0], [22.0, 175165.5], [23.0, 176612.0], [24.0, 172718.0], [25.0, 173585.0], [26.0, 178520.0], [27.0, 176942.0], [28.0, 174783.0], [30.0, 177575.0], [31.0, 176520.0], [33.0, 177623.0], [32.0, 179534.0], [35.0, 172971.0], [34.0, 176759.0], [37.0, 177336.0], [36.0, 177377.0], [39.0, 174464.0], [38.0, 181947.0], [40.0, 200382.0], [42.0, 180483.5], [45.0, 174954.0], [44.0, 174068.0], [47.0, 179446.0], [46.0, 177115.0], [49.0, 178875.0], [48.0, 179161.0], [51.0, 189170.0], [50.0, 179492.0], [53.0, 189334.0], [52.0, 174517.0], [55.0, 185923.0], [54.0, 192220.0], [57.0, 187096.0], [56.0, 185596.0], [59.0, 183192.0], [58.0, 190229.0], [60.0, 237350.59016393445], [1.0, 183356.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[45.38333333333335, 209181.32499999995]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 60.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8.05, "minX": 1.52082108E12, "maxY": 43293.0, "series": [{"data": [[1.52082114E12, 2164.65], [1.52082126E12, 43293.0], [1.52082108E12, 41128.35]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52082114E12, 8.05], [1.52082126E12, 161.0], [1.52082108E12, 152.95]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082126E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 180131.0666666667, "minX": 1.52082108E12, "maxY": 247783.0, "series": [{"data": [[1.52082114E12, 247783.0], [1.52082126E12, 180131.0666666667], [1.52082108E12, 237728.87719298247]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52082126E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 42937.15789473684, "minX": 1.52082108E12, "maxY": 47429.0, "series": [{"data": [[1.52082114E12, 47429.0], [1.52082126E12, 47042.21666666668], [1.52082108E12, 42937.15789473684]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52082126E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 7.683333333333334, "minX": 1.52082108E12, "maxY": 90.84210526315792, "series": [{"data": [[1.52082114E12, 11.666666666666666], [1.52082126E12, 7.683333333333334], [1.52082108E12, 90.84210526315792]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52082126E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 169790.0, "minX": 1.52082108E12, "maxY": 252071.0, "series": [{"data": [[1.52082114E12, 252071.0], [1.52082126E12, 200382.0], [1.52082108E12, 245415.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52082114E12, 244174.0], [1.52082126E12, 169790.0], [1.52082108E12, 217590.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52082114E12, 244447.3], [1.52082126E12, 243998.2], [1.52082108E12, 244285.8]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52082114E12, 252071.0], [1.52082126E12, 251027.92999999996], [1.52082108E12, 245415.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52082114E12, 245382.8], [1.52082126E12, 244449.65], [1.52082108E12, 244485.7]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082126E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 178524.0, "minX": 0.0, "maxY": 240860.0, "series": [{"data": [[0.0, 240860.0], [1.0, 178524.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 46480.0, "minX": 0.0, "maxY": 46995.5, "series": [{"data": [[0.0, 46480.0], [1.0, 46995.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 0.05, "minX": 1.52082084E12, "maxY": 1.0, "series": [{"data": [[1.52082114E12, 0.05], [1.52082108E12, 0.95], [1.52082084E12, 1.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082114E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.05, "minX": 1.52082108E12, "maxY": 1.0, "series": [{"data": [[1.52082114E12, 0.05], [1.52082126E12, 1.0], [1.52082108E12, 0.95]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082126E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.05, "minX": 1.52082108E12, "maxY": 1.0, "series": [{"data": [[1.52082114E12, 0.05], [1.52082126E12, 1.0], [1.52082108E12, 0.95]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52082126E12, "title": "Transactions Per Second"}},
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
