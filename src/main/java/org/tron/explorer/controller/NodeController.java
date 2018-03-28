/*
 * java-tron is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * java-tron is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
package org.tron.explorer.controller;

import com.maxmind.geoip2.exception.GeoIp2Exception;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.net.UnknownHostException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.tron.api.GrpcAPI.Node;
import org.tron.api.GrpcAPI.NodeList;
import org.tron.common.utils.ByteArray;
import org.tron.walletserver.WalletClient;
import com.maxmind.geoip2.DatabaseReader;
import com.maxmind.geoip2.model.CityResponse;
import com.maxmind.geoip2.record.*;
import java.io.File;
import java.net.InetAddress;

@RestController
public class NodeController {

  static final String splitString0 = "|||";
  static final String splitString1 = "\\|\\|\\|";
  private static Map<String, String> ipCity = loadCityMap();

  public static void addNewIp(String ip, Map ipCity) throws IOException, GeoIp2Exception {
    String dbPath = WalletClient.getDbPath();
    File database = new File(dbPath);
    DatabaseReader reader = new DatabaseReader.Builder(database).build();
    InetAddress ipAddress = InetAddress.getByName(ip);
    if (ipAddress == null) {
      return;
    }
    CityResponse response = reader.city(ipAddress);

    Country country = response.getCountry();
    //    Subdivision subdivision = response.getMostSpecificSubdivision();
    City city = response.getCity();
    //    Postal postal = response.getPostal();
    Location location = response.getLocation();

    String jsonData = "{\"country\":\"";
    jsonData += country.getName();
    jsonData += "\"";
    jsonData += ",\"city\":\"";
    jsonData += city.getName();
    jsonData += "\"";
    jsonData += ",\"longitude\":\"";
    jsonData += location.getLongitude();
    jsonData += "\"";
    jsonData += ",\"latitude\":\"";
    jsonData += location.getLatitude();
    jsonData += "\"}";

    String txtPath = WalletClient.getTxtPath();
    File txtFile = new File(txtPath);
    if (!txtFile.exists()) {
      txtFile.createNewFile();
    }
    FileWriter fw = new FileWriter(txtFile, true);
    BufferedWriter bw = new BufferedWriter(fw);
    bw.write(ip);
    bw.write(splitString0);
    bw.write(jsonData);
    bw.write("\n");
    bw.close();
    fw.close();

    ipCity.put(ip, jsonData);
  }

  private static Map<String, String> loadCityMap() {
    Map<String, String> ipCity = new HashMap<String, String>();
    try {
      String txtPath = WalletClient.getTxtPath();
      File txtFile = new File(txtPath);
      if (!txtFile.exists()) {
        return ipCity;
      }
      FileReader fr = new FileReader(txtFile);
      BufferedReader br = new BufferedReader(fr);
      String line = br.readLine();
      if (line == null) {
        return ipCity;
      }

      while (line != null) {
        String[] strings = line.split(splitString1);
        if (strings.length == 2) {
          ipCity.put(strings[0], strings[1]);
        }
        line = br.readLine();
      }
    } catch (IOException io) {
      io.printStackTrace();
    }
    return ipCity;
  }

  private static String Node2Json(Node node) throws IOException, GeoIp2Exception {
    String ip = ByteArray.toStr(node.getAddress().getHost().toByteArray());
    if (ipCity.containsKey(ip)) {
      return ipCity.get(ip);
    }
    addNewIp(ip, ipCity);
    if (ipCity.containsKey(ip)) {
      return ipCity.get(ip);
    }
    return "";
  }

  private static String NodeList2Json(NodeList nodeList) throws IOException, GeoIp2Exception {
    List<Node> listNode = nodeList.getNodesList();
    String nodes = "{\"nodes\":[";  // + node0 + "," + node1 +

    for (int i = 0; i < listNode.size(); i++) {
      Node node = listNode.get(i);
      String nodeString = Node2Json(node);
      if (i > 0) {
        nodes += ",";
      }
      nodes += nodeString;
    }

    nodes += "]}";
    return nodes;
  }

  @GetMapping("/nodeList")
  public String getNodeList() {
    try {
      Optional<NodeList> result = WalletClient.listNodes();
      if (result.isPresent()) {
        NodeList nodeList = result.get();
        return NodeList2Json(nodeList);
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
    return "";
  }
}
