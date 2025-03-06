package org.tron.ledger.listener;

import org.hid4java.HidDevice;
import org.hid4java.HidServicesListener;
import org.hid4java.event.HidServicesEvent;
import org.tron.ledger.wrapper.DebugConfig;
import org.tron.ledger.wrapper.HidServicesWrapper;
import org.tron.ledger.wrapper.LedgerSignResult;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static java.util.concurrent.TimeUnit.NANOSECONDS;
import static org.tron.ledger.console.ConsoleColor.ANSI_GREEN;
import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;
import static org.tron.ledger.console.ConsoleColor.ANSI_YELLOW;


public abstract class BaseListener implements HidServicesListener {
  public static void sleepNoInterruption(int sleepSeconds) {
    boolean interrupted = false;
    try {
      long remainingNanos = TimeUnit.SECONDS.toNanos(sleepSeconds);
      long end = System.nanoTime() + remainingNanos;
      while (remainingNanos > 0 && !LedgerEventListener.getInstance().getLedgerSignEnd().get()) {
        try {
          long sleepTime = Math.min(remainingNanos, TimeUnit.MILLISECONDS.toNanos(100));
          NANOSECONDS.sleep(sleepTime);
          remainingNanos = end - System.nanoTime();
        } catch (InterruptedException e) {
          interrupted = true;
          remainingNanos = end - System.nanoTime();
        }
      }
    } finally {
      if (interrupted) {
        Thread.currentThread().interrupt();
      }
    }
  }

  @Override
  public void hidDeviceAttached(HidServicesEvent event) {
    if (event.getHidDevice().getManufacturer().equals("Ledger")) {
      if (DebugConfig.isDebugEnabled()) {
        String product = event.getHidDevice().getProduct();
        System.out.println(ANSI_GREEN + "Device " + product + " found: " + event + ANSI_RESET);
      }
    }
  }

  @Override
  public void hidDeviceDetached(HidServicesEvent event) {
    if (DebugConfig.isDebugEnabled()) {
      System.out.println(ANSI_YELLOW + "Device detached: " + event + ANSI_RESET);
    }
    LedgerSignResult.updateAllSigningToReject(event.getHidDevice().getPath());
    LedgerEventListener.getInstance().getLedgerSignEnd().compareAndSet(false, true);
    TransactionSignManager.getInstance().setTransaction(null);
    if (TransactionSignManager.getInstance().getHidDevice() !=null) {
      TransactionSignManager.getInstance().getHidDevice().close();
      TransactionSignManager.getInstance().setHidDevice(null);
    }
    HidDevice hidDevice = HidServicesWrapper.getInstance().getHidDevice();
    if (hidDevice != null) {
      HidServicesWrapper.getInstance().getHidDevice().close();
      HidServicesWrapper.getInstance().setHidDevice(null);
    }
  }

  @Override
  public void hidFailure(HidServicesEvent event) {
    if (DebugConfig.isDebugEnabled()) {
      System.out.println(ANSI_RED + "HID failure: " + event + ANSI_RESET);
    }
  }

  @Override
  public void hidDataReceived(HidServicesEvent event) {

  }

}
