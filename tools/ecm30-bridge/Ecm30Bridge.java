import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;

import org.eclipse.bpmn2.Bpmn2Package;
import org.eclipse.bpmn2.documentacional.BpmnProcess;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceFactoryImpl;
import org.eclipse.graphiti.mm.algorithms.AlgorithmsPackage;
import org.eclipse.graphiti.mm.algorithms.styles.StylesPackage;
import org.eclipse.graphiti.mm.pictograms.Diagram;
import org.eclipse.graphiti.mm.pictograms.PictogramsPackage;
import org.osgi.framework.Version;

import com.fluig.bpm.utils.ProjectUtils;
import com.totvs.tds.ecm.designer.export.bpmn20.export.BPMN2ECM30ExportMarshaller;

/**
 * Minimal command-line bridge to the Fluig Studio 1.8.2.2 BPMN -> ECM 3.0
 * marshaller. This intentionally bypasses the Eclipse UI and never writes to
 * the source .process file.
 */
public final class Ecm30Bridge {
    private Ecm30Bridge() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 2 || args.length > 3) {
            System.err.println("Usage: Ecm30Bridge <input.process> <output.ecm30.xml> [server-version]");
            System.exit(2);
        }

        Path input = Paths.get(args[0]).toAbsolutePath().normalize();
        Path output = Paths.get(args[1]).toAbsolutePath().normalize();
        String serverVersion = args.length == 3 ? args[2] : "1.8.2";

        if (!Files.isRegularFile(input)) {
            throw new IllegalArgumentException("Process file not found: " + input);
        }

        initialiseMetamodels();
        ProjectUtils.configure(findProjectRoot(input).toFile(), stripProcessExtension(input));
        Resource resource = loadProcess(input);
        Diagram diagram = find(resource, Diagram.class);
        BpmnProcess process = find(resource, BpmnProcess.class);

        BPMN2ECM30ExportMarshaller marshaller = new BPMN2ECM30ExportMarshaller();
        marshaller.setDiagram(diagram);
        setPrivateField(marshaller, "fluigServerVersion", Version.parseVersion(serverVersion));

        @SuppressWarnings("rawtypes")
        ArrayList elements = marshaller.getListOfElements(process, resource.getContents());
        String xml = marshaller.getXmlFromXStream(elements);

        Path parent = output.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Files.write(output, xml.getBytes(StandardCharsets.UTF_8));
        System.out.println("Generated " + output + " (" + elements.size() + " runtime collections)");
    }

    private static void initialiseMetamodels() {
        Bpmn2Package.eINSTANCE.eClass();
        PictogramsPackage.eINSTANCE.eClass();
        AlgorithmsPackage.eINSTANCE.eClass();
        StylesPackage.eINSTANCE.eClass();
    }

    private static Resource loadProcess(Path input) throws Exception {
        ResourceSet resourceSet = new ResourceSetImpl();
        resourceSet.getResourceFactoryRegistry().getExtensionToFactoryMap()
            .put("process", new XMIResourceFactoryImpl());
        Resource resource = resourceSet.getResource(URI.createFileURI(input.toString()), true);
        resource.load(null);
        return resource;
    }

    private static Path findProjectRoot(Path input) {
        Path diagrams = input.getParent();
        if (diagrams == null || !"diagrams".equalsIgnoreCase(diagrams.getFileName().toString())) {
            throw new IllegalArgumentException("Expected process under workflow/diagrams: " + input);
        }
        Path workflow = diagrams.getParent();
        if (workflow == null || !"workflow".equalsIgnoreCase(workflow.getFileName().toString())) {
            throw new IllegalArgumentException("Expected process under workflow/diagrams: " + input);
        }
        return workflow.getParent();
    }

    private static String stripProcessExtension(Path input) {
        String fileName = input.getFileName().toString();
        return fileName.substring(0, fileName.length() - ".process".length());
    }

    private static <T> T find(Resource resource, Class<T> type) {
        for (EObject object : resource.getContents()) {
            if (type.isInstance(object)) {
                return type.cast(object);
            }
        }
        throw new IllegalStateException("Missing " + type.getSimpleName() + " in " + resource.getURI());
    }

    private static void setPrivateField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
