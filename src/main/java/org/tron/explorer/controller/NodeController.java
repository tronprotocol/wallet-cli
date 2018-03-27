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

import java.util.Optional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.tron.api.GrpcAPI.NodeList;
import org.tron.protos.Protocol.Block;
import org.tron.walletserver.WalletClient;

@RestController
public class NodeController {

  @GetMapping("/nodeList")
  public byte[] getNodeList() {
    try {
      Optional<NodeList> result = WalletClient.listNodes();
      if (result.isPresent()) {
        NodeList nodeList = result.get();
        return nodeList.toByteArray();
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
    return null;
  }
}
