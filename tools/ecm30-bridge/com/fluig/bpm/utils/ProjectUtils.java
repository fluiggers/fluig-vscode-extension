package com.fluig.bpm.utils;

import java.io.File;
import java.util.HashMap;

import org.eclipse.bpmn2.impl.BaseElementImpl;
import org.eclipse.graphiti.mm.pictograms.Diagram;

/**
 * Standalone filesystem shim for the four ProjectUtils methods used by the
 * official ECM 3.0 marshaller. The Studio implementation resolves these paths
 * through an open Eclipse workspace; the bridge already has the project path.
 */
public final class ProjectUtils {
    private static File projectRoot;
    private static String processName;

    private ProjectUtils() {
    }

    public static void configure(File root, String name) {
        projectRoot = root;
        processName = name;
    }

    public static HashMap<String, File> getScriptFiles(Diagram ignored) {
        HashMap<String, File> files = new HashMap<String, File>();
        File folder = new File(projectRoot, "workflow/scripts");
        File[] children = folder.listFiles();
        if (children == null) {
            return files;
        }

        String prefix = processName + ".";
        for (File child : children) {
            String name = child.getName();
            if (child.isFile() && name.startsWith(prefix) && name.endsWith(".js")) {
                files.put(name.substring(prefix.length(), name.length() - 3), child);
            }
        }
        return files;
    }

    public static HashMap<String, File> getLiteralFiles(Diagram ignored) {
        HashMap<String, File> files = new HashMap<String, File>();
        File folder = new File(projectRoot, "workflow/literals");
        addLiteral(files, folder, processName + "_pt_BR.properties", "POR_LITERALS");
        addLiteral(files, folder, processName + "_es.properties", "ESP_LITERALS");
        addLiteral(files, folder, processName + "_en_US.properties", "ENG_LITERALS");
        return files;
    }

    public static String getScriptFileName(String processId, String elementId) {
        return processId + "." + elementId + ".js";
    }

    public static boolean existScript(Diagram ignored, BaseElementImpl element) {
        File script = new File(new File(projectRoot, "workflow/scripts"),
            getScriptFileName(processName, element.getId()));
        return script.isFile();
    }

    private static void addLiteral(HashMap<String, File> files, File folder, String name, String key) {
        File file = new File(folder, name);
        if (file.isFile()) {
            files.put(key, file);
        }
    }
}
